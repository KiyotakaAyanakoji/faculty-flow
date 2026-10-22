import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../../config/database.js';
import { getEmailTransport } from './transport.js';
import { renderEmailTemplate } from './templates.js';
import { sanitizeErrorMessage } from './sanitizer.js';
import { EmailNotificationRecord } from './template-types.js';

export interface NotificationWorkerOptions {
  workerId?: string;
  pollIntervalMs?: number;
  batchSize?: number;
  leaseTimeoutSeconds?: number;
  baseBackoffSeconds?: number;
  keyPrefix?: string;
}

export class NotificationWorker {
  private workerId: string;
  private pollIntervalMs: number;
  private batchSize: number;
  private leaseTimeoutSeconds: number;
  private baseBackoffSeconds: number;
  private keyPrefix?: string;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;
  private isRunning: boolean = false;

  constructor(options: NotificationWorkerOptions = {}) {
    this.workerId = options.workerId || `worker-${process.pid}-${Math.random().toString(36).substring(2, 6)}`;
    this.pollIntervalMs = options.pollIntervalMs || 5000;
    this.batchSize = options.batchSize || 10;
    this.leaseTimeoutSeconds = options.leaseTimeoutSeconds || 300; // 5 minutes
    this.baseBackoffSeconds = options.baseBackoffSeconds || 30;
    this.keyPrefix = options.keyPrefix;
  }

  /**
   * Starts the background polling worker
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.timer = setInterval(async () => {
      if (!this.isProcessing && this.isRunning) {
        try {
          await this.processPendingJobs();
        } catch (err) {
          console.error(`[NotificationWorker ${this.workerId}] Error in job loop:`, err);
        }
      }
    }, this.pollIntervalMs);

    // Unref timer so it doesn't prevent Node from exiting if idle
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Stops the background worker and cleans up timers
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Wait if a batch is currently executing
    let waitedMs = 0;
    while (this.isProcessing && waitedMs < 5000) {
      await new Promise(res => setTimeout(res, 100));
      waitedMs += 100;
    }
  }

  /**
   * Recovers jobs left in 'Processing' status due to an ungraceful shutdown or crash.
   */
  async recoverStaleJobs(): Promise<number> {
    try {
      let query = `UPDATE email_notifications
         SET status = 'Pending',
             locked_at = NULL,
             locked_by = NULL
         WHERE status = 'Processing'
           AND locked_at < NOW() - INTERVAL ? SECOND`;
      const params: any[] = [this.leaseTimeoutSeconds];
      if (this.keyPrefix) {
        query += ' AND idempotency_key LIKE ?';
        params.push(`${this.keyPrefix}%`);
      }

      const [result] = await pool.query<ResultSetHeader>(query, params);

      if (result.affectedRows > 0) {
        console.warn(
          `[NotificationWorker ${this.workerId}] Recovered ${result.affectedRows} stale processing job(s).`
        );
      }
      return result.affectedRows;
    } catch (err) {
      console.error(`[NotificationWorker ${this.workerId}] Error recovering stale jobs:`, err);
      return 0;
    }
  }

  /**
   * Claims and processes a batch of pending notifications.
   * Can be invoked manually in test suites or triggered by the background interval.
   */
  async processPendingJobs(): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    let processedCount = 0;

    try {
      // 1. Recover any stale processing jobs first
      await this.recoverStaleJobs();

      // 2. Claim pending jobs atomically
      const claimedJobs = await this.claimJobsBatch();
      if (claimedJobs.length === 0) {
        return 0;
      }

      const transport = getEmailTransport();

      // 3. Process each claimed job
      for (const job of claimedJobs) {
        try {
          const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
          const rendered = renderEmailTemplate(job.template_id, payload);

          // Deliver email via active transport
          const sendResult = await transport.send({
            to: job.recipient_email,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
          });

          if (sendResult.success) {
            // Mark job as Sent
            await pool.query(
              `UPDATE email_notifications
               SET status = 'Sent',
                   sent_at = NOW(),
                   error_message = NULL,
                   locked_at = NULL,
                   locked_by = NULL
               WHERE id = ?`,
              [job.id]
            );
            processedCount++;
          } else {
            // Handle delivery failure
            await this.handleJobFailure(job, sendResult.error || 'Transport delivery failed');
          }
        } catch (jobErr: any) {
          const sanitized = sanitizeErrorMessage(jobErr);
          await this.handleJobFailure(job, sanitized);
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  /**
   * Claims a batch of pending jobs atomically using row-level locking
   */
  private async claimJobsBatch(): Promise<EmailNotificationRecord[]> {
    const connection: PoolConnection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      let query = `SELECT * FROM email_notifications
         WHERE status = 'Pending'
           AND (next_retry_at IS NULL OR next_retry_at <= NOW())`;
      const params: any[] = [];
      if (this.keyPrefix) {
        query += ' AND idempotency_key LIKE ?';
        params.push(`${this.keyPrefix}%`);
      }
      const limit = parseInt(String(this.batchSize || 10), 10);
      query += ` ORDER BY id ASC LIMIT ${limit} FOR UPDATE`;

      // Select pending jobs due for processing
      const [rows] = await connection.query<RowDataPacket[]>(query, params);

      if (!rows.length) {
        await connection.commit();
        return [];
      }

      const ids = rows.map(r => r.id);

      // Claim rows by marking them 'Processing'
      await connection.query(
        `UPDATE email_notifications
         SET status = 'Processing',
             locked_at = NOW(),
             locked_by = ?
         WHERE id IN (?)`,
        [this.workerId, ids]
      );

      await connection.commit();

      return rows as EmailNotificationRecord[];
    } catch (err) {
      await connection.rollback();
      console.error(`[NotificationWorker ${this.workerId}] Claim transaction failed:`, err);
      return [];
    } finally {
      connection.release();
    }
  }

  /**
   * Handles delivery failure with exponential backoff and max attempts limit
   */
  private async handleJobFailure(job: EmailNotificationRecord, errorMessage: string): Promise<void> {
    const nextAttempts = Number(job.attempts || 0) + 1;
    const maxAttempts = Number(job.max_attempts || 3);
    const sanitizedError = sanitizeErrorMessage(errorMessage);

    if (nextAttempts >= maxAttempts) {
      // Mark as permanently Failed
      await pool.query(
        `UPDATE email_notifications
         SET status = 'Failed',
             attempts = ?,
             error_message = ?,
             locked_at = NULL,
             locked_by = NULL
         WHERE id = ?`,
        [nextAttempts, sanitizedError, job.id]
      );

      console.warn(
        `[NotificationWorker] Job ${job.id} (${job.event_type}) failed permanently after ${nextAttempts} attempts.`
      );
    } else {
      // Exponential backoff: base * 2^(attempts-1) seconds
      const backoffSec = Math.min(
        this.baseBackoffSeconds * Math.pow(2, nextAttempts - 1),
        3600 // max 1 hour backoff
      );

      await pool.query(
        `UPDATE email_notifications
         SET status = 'Pending',
             attempts = ?,
             next_retry_at = NOW() + INTERVAL ? SECOND,
             error_message = ?,
             locked_at = NULL,
             locked_by = NULL
         WHERE id = ?`,
        [nextAttempts, backoffSec, sanitizedError, job.id]
      );
    }
  }
}

// Singleton worker instance
export const notificationWorker = new NotificationWorker();
