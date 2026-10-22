import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../../config/database.js';
import { isValidEmail, sanitizeHeader } from './sanitizer.js';
import { EnqueueNotificationParams, EmailNotificationRecord } from './template-types.js';

export interface EnqueueResult {
  enqueued: boolean;
  notificationId?: number;
  isDuplicate?: boolean;
  error?: string;
}

/**
 * Enqueues a notification into the durable MySQL queue.
 *
 * If a `connection` is provided (e.g. from an ongoing business transaction),
 * the enqueue statement executes as part of that transaction and commits atomically.
 */
export async function enqueueNotification(
  params: EnqueueNotificationParams,
  connection?: PoolConnection
): Promise<EnqueueResult> {
  const executor = connection || pool;

  try {
    const rawEmail = (params.recipientEmail || '').trim();
    const cleanEmail = sanitizeHeader(rawEmail);
    const cleanSubject = sanitizeHeader(params.subject || 'Faculty Flow Notification');

    // Handle invalid or missing email by recording as a permanent failure immediately
    const isValid = isValidEmail(cleanEmail);
    const initialStatus = isValid ? 'Pending' : 'Failed';
    const initialError = isValid ? null : 'Missing or invalid recipient email address';

    const [result] = await executor.query<ResultSetHeader>(
      `INSERT IGNORE INTO email_notifications (
         idempotency_key, event_type, recipient_email, recipient_name,
         recipient_id, subject, template_id, payload, status, error_message, attempts
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.idempotencyKey,
        params.eventType,
        cleanEmail,
        params.recipientName ? sanitizeHeader(params.recipientName) : null,
        params.recipientId || null,
        cleanSubject,
        params.templateId,
        JSON.stringify(params.payload || {}),
        initialStatus,
        initialError,
        isValid ? 0 : 1,
      ]
    );

    const isDuplicate = result.affectedRows === 0;

    return {
      enqueued: true,
      notificationId: result.insertId || undefined,
      isDuplicate,
    };
  } catch (err: any) {
    // If idempotency constraint was hit concurrently
    if (err.code === 'ER_DUP_ENTRY') {
      return {
        enqueued: true,
        isDuplicate: true,
      };
    }

    console.error('[Notification Queue] Failed to enqueue notification:', err);
    return {
      enqueued: false,
      error: err.message || 'Failed to enqueue notification',
    };
  }
}

/**
 * Retrieves a single notification record by ID
 */
export async function getNotificationById(id: number): Promise<EmailNotificationRecord | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM email_notifications WHERE id = ?',
    [id]
  );
  if (!rows.length) return null;

  const row = rows[0];
  return {
    ...row,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
  } as EmailNotificationRecord;
}

/**
 * Retrieves a single notification record by idempotency key
 */
export async function getNotificationByIdempotencyKey(
  key: string
): Promise<EmailNotificationRecord | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM email_notifications WHERE idempotency_key = ?',
    [key]
  );
  if (!rows.length) return null;

  const row = rows[0];
  return {
    ...row,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
  } as EmailNotificationRecord;
}
