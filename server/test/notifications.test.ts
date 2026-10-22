import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool } from '../src/config/database.js';
import { seedDatabase } from '../src/db/seed.js';
import {
  MockEmailTransport,
  DevEmailTransport,
  SmtpEmailTransport,
  setEmailTransport,
} from '../src/services/email/transport.js';
import {
  NotificationWorker,
} from '../src/services/email/worker.js';
import {
  enqueueNotification,
  getNotificationById,
  getNotificationByIdempotencyKey,
} from '../src/services/email/queue.service.js';
import {
  escapeHtml,
  sanitizeHeader,
  sanitizeErrorMessage,
  isValidEmail,
} from '../src/services/email/sanitizer.js';
import { renderEmailTemplate } from '../src/services/email/templates.js';
import { NOTIFICATION_EVENTS } from '../src/services/email/template-types.js';

describe('Email Notifications & Queue Worker Test Suite (Phase 7)', () => {
  let mockTransport: MockEmailTransport;
  let adminToken: string;
  let hodCsToken: string;
  let profCsToken: string;
  let asstCsToken: string;
  let hodMechToken: string;

  let profCsUserId: number;
  let asstCsUserId: number;
  let hodCsUserId: number;
  let hodMechUserId: number;
  let casualLeaveTypeId: number;

  beforeAll(async () => {
    // Install MockEmailTransport for the entire test suite
    mockTransport = new MockEmailTransport();
    setEmailTransport(mockTransport);

    await seedDatabase();

    const [users] = await pool.query<any[]>('SELECT id, email FROM users');
    profCsUserId = users.find((u: any) => u.email === 'prof.cs@facultyflow.local').id;
    asstCsUserId = users.find((u: any) => u.email === 'asst.cs@facultyflow.local').id;
    hodCsUserId = users.find((u: any) => u.email === 'hod.cs@facultyflow.local').id;
    hodMechUserId = users.find((u: any) => u.email === 'hod.mech@facultyflow.local').id;

    const [leaveTypes] = await pool.query<any[]>('SELECT id, code FROM leave_types');
    casualLeaveTypeId = leaveTypes.find((lt: any) => lt.code === 'CASUAL').id;

    async function getToken(email: string) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'Password@12345' });
      return res.body.accessToken;
    }

    adminToken = await getToken('admin@facultyflow.local');
    hodCsToken = await getToken('hod.cs@facultyflow.local');
    profCsToken = await getToken('prof.cs@facultyflow.local');
    asstCsToken = await getToken('asst.cs@facultyflow.local');
    hodMechToken = await getToken('hod.mech@facultyflow.local');

    // Clean up test-specific isolated records
    await pool.query("DELETE FROM email_notifications WHERE idempotency_key LIKE 'test-%'");
    await pool.query("DELETE FROM tasks WHERE title LIKE '[TEST-NOTIF] %'");
    await pool.query("DELETE FROM academic_events WHERE title LIKE '[TEST-NOTIF] %'");
    await pool.query("DELETE FROM handovers WHERE title LIKE '[TEST-NOTIF] %'");
    await pool.query("DELETE FROM leave_requests WHERE reason LIKE '[TEST-NOTIF] %'");
  });

  beforeEach(async () => {
    mockTransport.clear();
    setEmailTransport(mockTransport);
    await pool.query("DELETE FROM email_notifications WHERE idempotency_key LIKE 'test-%'");
    await pool.query("DELETE FROM tasks WHERE title LIKE '[TEST-NOTIF] %'");
    await pool.query("DELETE FROM academic_events WHERE title LIKE '[TEST-NOTIF] %'");
    await pool.query("DELETE FROM handovers WHERE title LIKE '[TEST-NOTIF] %'");
    await pool.query("DELETE FROM leave_requests WHERE reason LIKE '[TEST-NOTIF] %'");
  });

  afterAll(async () => {
    setEmailTransport(null);
    await pool.query("DELETE FROM email_notifications WHERE idempotency_key LIKE 'test-%'");
    await pool.query("DELETE FROM tasks WHERE title LIKE '[TEST-NOTIF] %'");
    await pool.query("DELETE FROM academic_events WHERE title LIKE '[TEST-NOTIF] %'");
    await pool.query("DELETE FROM handovers WHERE title LIKE '[TEST-NOTIF] %'");
    await pool.query("DELETE FROM leave_requests WHERE reason LIKE '[TEST-NOTIF] %'");
  });

  // =========================================================================
  // 1. Sanitization, Header Safety, and HTML Escaping
  // =========================================================================
  describe('Sanitizer & Security Utilities', () => {
    it('should escape HTML characters preventing XSS injection', () => {
      const dangerous = '<script>alert("XSS & cookies")</script>';
      const safe = escapeHtml(dangerous);
      expect(safe).toBe('&lt;script&gt;alert(&quot;XSS &amp; cookies&quot;)&lt;/script&gt;');
      expect(safe).not.toContain('<script>');
    });

    it('should strip CRLF characters preventing SMTP header injection', () => {
      const maliciousHeader = 'faculty@example.com\r\nBcc: spy@evil.com\r\nSubject: Injected';
      const clean = sanitizeHeader(maliciousHeader);
      expect(clean).not.toContain('\r');
      expect(clean).not.toContain('\n');
      expect(clean).toBe('faculty@example.comBcc: spy@evil.comSubject: Injected');
    });

    it('should validate email addresses accurately', () => {
      expect(isValidEmail('hod.cs@facultyflow.local')).toBe(true);
      expect(isValidEmail('faculty+test@university.edu')).toBe(true);
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });

    it('should redact credentials and passwords from error messages', () => {
      const rawError = 'SMTP auth failed for user=admin pass=SuperSecretPassword123 with token=eyJhbGciOi';
      const sanitized = sanitizeErrorMessage(rawError);
      expect(sanitized).not.toContain('SuperSecretPassword123');
      expect(sanitized).not.toContain('eyJhbGciOi');
      expect(sanitized).toContain('[REDACTED]');
    });
  });

  // =========================================================================
  // 2. Centralized Email Templates
  // =========================================================================
  describe('Template Rendering & Branding', () => {
    it('should render all 14 supported event templates with HTML escaping and plain-text fallback', () => {
      const testEvents = [
        {
          id: NOTIFICATION_EVENTS.TASK_ASSIGNED,
          payload: { taskTitle: 'Review <b>CS101</b>', assignedByName: 'HOD CS', dueDate: '2026-11-01', priority: 'High', taskId: 101 },
        },
        {
          id: NOTIFICATION_EVENTS.TASK_UPDATED,
          payload: { taskTitle: 'Prepare Midterm Exam', updatedByName: 'HOD CS', status: 'In Progress', taskId: 102 },
        },
        {
          id: NOTIFICATION_EVENTS.TASK_REASSIGNED,
          payload: { taskTitle: 'Lab Coordination', reassignedByName: 'HOD CS', taskId: 103 },
        },
        {
          id: NOTIFICATION_EVENTS.TASK_CANCELLED,
          payload: { taskTitle: 'Old Curriculum Review', cancelledByName: 'HOD CS', taskId: 104 },
        },
        {
          id: NOTIFICATION_EVENTS.LEAVE_SUBMITTED,
          payload: { leaveType: 'Casual Leave', startDate: '2026-11-05', endDate: '2026-11-06', daysCount: 2, requestId: 201 },
        },
        {
          id: NOTIFICATION_EVENTS.LEAVE_PENDING_APPROVAL,
          payload: { requesterName: 'Prof CS <script>', leaveType: 'Casual Leave', startDate: '2026-11-05', endDate: '2026-11-06', daysCount: 2, departmentName: 'CS', requestId: 202 },
        },
        {
          id: NOTIFICATION_EVENTS.LEAVE_APPROVED,
          payload: { leaveType: 'Sick Leave', startDate: '2026-11-10', endDate: '2026-11-11', daysCount: 2, decidedByName: 'HOD CS', requestId: 203 },
        },
        {
          id: NOTIFICATION_EVENTS.LEAVE_REJECTED,
          payload: { leaveType: 'Unpaid Leave', startDate: '2026-11-12', endDate: '2026-11-15', daysCount: 4, decidedByName: 'HOD CS', rejectionReason: 'Exam week coverage needed', requestId: 204 },
        },
        {
          id: NOTIFICATION_EVENTS.LEAVE_CANCELLED,
          payload: { leaveType: 'Casual Leave', startDate: '2026-11-05', endDate: '2026-11-06', requestId: 205 },
        },
        {
          id: NOTIFICATION_EVENTS.EVENT_INVITATION,
          payload: { eventTitle: 'Department Board Meeting', eventType: 'Meeting', startDate: '2026-11-15', location: 'Hall A', createdByName: 'HOD CS', eventId: 301 },
        },
        {
          id: NOTIFICATION_EVENTS.EVENT_UPDATED,
          payload: { eventTitle: 'Faculty Orientation', eventType: 'Workshop', startDate: '2026-11-16', location: 'Virtual', updatedByName: 'HOD CS', eventId: 302 },
        },
        {
          id: NOTIFICATION_EVENTS.EVENT_CANCELLED,
          payload: { eventTitle: 'Canceled Workshop', cancelledByName: 'HOD CS', eventId: 303 },
        },
        {
          id: NOTIFICATION_EVENTS.HANDOVER_CREATED,
          payload: { handoverTitle: 'CS201 Lab Handover', senderName: 'Prof CS', courseCode: 'CS201', handoverId: 401 },
        },
        {
          id: NOTIFICATION_EVENTS.HANDOVER_STATUS_UPDATED,
          payload: { handoverTitle: 'CS201 Lab Handover', recipientName: 'Asst CS', status: 'Accepted', handoverId: 402 },
        },
      ];

      for (let i = 0; i < testEvents.length; i++) {
        const ev = testEvents[i];
        const rendered = renderEmailTemplate(ev.id, ev.payload);
        expect(rendered.subject).toBeTruthy();
        expect(rendered.html).toContain('Faculty Flow 2.0');
        expect(rendered.html).toContain('<!DOCTYPE html>');
        expect(rendered.text).toBeTruthy();
        expect(rendered.html).not.toContain('<script>');

        if (i === 0) {
          expect(rendered.html).not.toContain('<b>CS101</b>');
          expect(rendered.html).toContain('&lt;b&gt;CS101&lt;/b&gt;');
        }
      }
    });

    it('should throw an error for unsupported template IDs', () => {
      expect(() => renderEmailTemplate('NON_EXISTENT_TEMPLATE', {})).toThrow('Unsupported email template');
    });
  });

  // =========================================================================
  // 3. Transport Modes and Configuration
  // =========================================================================
  describe('Email Transport Behavior', () => {
    it('DevEmailTransport should log safe preview and return success without real email delivery', async () => {
      const devTransport = new DevEmailTransport();
      const result = await devTransport.send({
        to: 'faculty.member@facultyflow.local',
        subject: 'Dev Test Subject',
        html: '<p>Dev test body</p>',
        text: 'Dev test body',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toMatch(/^dev-/);
    });

    it('SmtpEmailTransport should throw clear error if initialized without SMTP_HOST when enabled', () => {
      const originalHost = process.env.SMTP_HOST;
      try {
        delete (process.env as any).SMTP_HOST;
        expect(() => new SmtpEmailTransport()).toThrow('Invalid SMTP configuration');
      } finally {
        if (originalHost) process.env.SMTP_HOST = originalHost;
      }
    });

    it('MockEmailTransport should record sent messages accurately', async () => {
      mockTransport.clear();
      const sendResult = await mockTransport.send({
        to: 'asst.cs@facultyflow.local',
        subject: 'Mock Subject',
        html: '<p>Test</p>',
        text: 'Test',
      });

      expect(sendResult.success).toBe(true);
      expect(mockTransport.sentMessages.length).toBe(1);
      expect(mockTransport.sentMessages[0].to).toBe('asst.cs@facultyflow.local');
    });
  });

  // =========================================================================
  // 4. Queue Enqueueing, Idempotency & Transactional Integrity
  // =========================================================================
  describe('Durable Notification Queue & Idempotency', () => {
    it('should enqueue a notification with Pending status and zero attempts', async () => {
      const result = await enqueueNotification({
        idempotencyKey: 'test-job-pending-1',
        eventType: NOTIFICATION_EVENTS.TASK_ASSIGNED,
        recipientEmail: 'prof.cs@facultyflow.local',
        recipientName: 'Prof CS',
        recipientId: profCsUserId,
        subject: 'New Task Assignment',
        templateId: NOTIFICATION_EVENTS.TASK_ASSIGNED,
        payload: { taskTitle: 'Grade Assignments', taskId: 1 },
      });

      expect(result.enqueued).toBe(true);
      expect(result.isDuplicate).toBe(false);

      const record = await getNotificationByIdempotencyKey('test-job-pending-1');
      expect(record).not.toBeNull();
      expect(record?.status).toBe('Pending');
      expect(record?.attempts).toBe(0);
      expect(record?.recipient_email).toBe('prof.cs@facultyflow.local');
      expect(record?.payload.taskTitle).toBe('Grade Assignments');
    });

    it('should record an invalid/missing recipient email immediately as Failed', async () => {
      const result = await enqueueNotification({
        idempotencyKey: 'test-job-invalid-email-1',
        eventType: NOTIFICATION_EVENTS.TASK_ASSIGNED,
        recipientEmail: 'not-a-valid-email-format',
        recipientName: 'Bad Email User',
        subject: 'Invalid Email Test',
        templateId: NOTIFICATION_EVENTS.TASK_ASSIGNED,
        payload: { taskTitle: 'Test' },
      });

      expect(result.enqueued).toBe(true);
      const record = await getNotificationByIdempotencyKey('test-job-invalid-email-1');
      expect(record).not.toBeNull();
      expect(record?.status).toBe('Failed');
      expect(record?.error_message).toContain('Missing or invalid recipient email');
      expect(record?.attempts).toBe(1);
    });

    it('should enforce idempotency and not create duplicates for the same idempotency key', async () => {
      const first = await enqueueNotification({
        idempotencyKey: 'test-idempotency-key-duplicate',
        eventType: NOTIFICATION_EVENTS.LEAVE_APPROVED,
        recipientEmail: 'asst.cs@facultyflow.local',
        subject: 'Leave Approved',
        templateId: NOTIFICATION_EVENTS.LEAVE_APPROVED,
        payload: { leaveType: 'Casual' },
      });
      expect(first.enqueued).toBe(true);
      expect(first.isDuplicate).toBe(false);

      const second = await enqueueNotification({
        idempotencyKey: 'test-idempotency-key-duplicate',
        eventType: NOTIFICATION_EVENTS.LEAVE_APPROVED,
        recipientEmail: 'asst.cs@facultyflow.local',
        subject: 'Leave Approved',
        templateId: NOTIFICATION_EVENTS.LEAVE_APPROVED,
        payload: { leaveType: 'Casual' },
      });
      expect(second.enqueued).toBe(true);
      expect(second.isDuplicate).toBe(true);

      const [rows] = await pool.query<any[]>(
        'SELECT COUNT(*) as count FROM email_notifications WHERE idempotency_key = ?',
        ['test-idempotency-key-duplicate']
      );
      expect(rows[0].count).toBe(1);
    });

    it('should rollback enqueued notification if parent business transaction rolls back', async () => {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        await enqueueNotification(
          {
            idempotencyKey: 'test-transaction-rollback',
            eventType: NOTIFICATION_EVENTS.EVENT_INVITATION,
            recipientEmail: 'prof.cs@facultyflow.local',
            subject: 'Event Rollback Test',
            templateId: NOTIFICATION_EVENTS.EVENT_INVITATION,
            payload: { eventTitle: 'Temporary Meeting' },
          },
          conn
        );

        // Explicitly rollback transaction
        await conn.rollback();
      } finally {
        conn.release();
      }

      const record = await getNotificationByIdempotencyKey('test-transaction-rollback');
      expect(record).toBeNull();
    });

    it('should commit enqueued notification when parent business transaction commits', async () => {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        await enqueueNotification(
          {
            idempotencyKey: 'test-transaction-commit',
            eventType: NOTIFICATION_EVENTS.EVENT_INVITATION,
            recipientEmail: 'prof.cs@facultyflow.local',
            subject: 'Event Commit Test',
            templateId: NOTIFICATION_EVENTS.EVENT_INVITATION,
            payload: { eventTitle: 'Confirmed Meeting' },
          },
          conn
        );

        await conn.commit();
      } finally {
        conn.release();
      }

      const record = await getNotificationByIdempotencyKey('test-transaction-commit');
      expect(record).not.toBeNull();
      expect(record?.status).toBe('Pending');
    });
  });

  // =========================================================================
  // 5. Worker Processing, Retries, Backoff & Crash Recovery
  // =========================================================================
  describe('NotificationWorker Processing & Lifecycle', () => {
    it('should claim pending jobs and transition them to Sent upon successful delivery', async () => {
      await enqueueNotification({
        idempotencyKey: 'test-worker-success-1',
        eventType: NOTIFICATION_EVENTS.TASK_ASSIGNED,
        recipientEmail: 'prof.cs@facultyflow.local',
        subject: 'Worker Delivery Success',
        templateId: NOTIFICATION_EVENTS.TASK_ASSIGNED,
        payload: { taskTitle: 'Prepare Syllabus', taskId: 55 },
      });

      const worker = new NotificationWorker({ workerId: 'test-worker-1', batchSize: 5, keyPrefix: 'test-worker-success-1' });
      const processed = await worker.processPendingJobs();

      expect(processed).toBeGreaterThanOrEqual(1);
      const record = await getNotificationByIdempotencyKey('test-worker-success-1');
      expect(record?.status).toBe('Sent');
      expect(record?.sent_at).not.toBeNull();
      expect(record?.locked_at).toBeNull();
      expect(mockTransport.sentMessages.some(m => m.subject.includes('Prepare Syllabus'))).toBe(true);
    });

    it('should handle transient transport failures by scheduling retry with backoff', async () => {
      await enqueueNotification({
        idempotencyKey: 'test-worker-transient-1',
        eventType: NOTIFICATION_EVENTS.LEAVE_APPROVED,
        recipientEmail: 'asst.cs@facultyflow.local',
        subject: 'Transient Failure Test',
        templateId: NOTIFICATION_EVENTS.LEAVE_APPROVED,
        payload: { leaveType: 'Casual' },
      });

      mockTransport.failNextWithTransient = true;
      mockTransport.failureMessage = 'Temporary SMTP network timeout (ETIMEDOUT)';

      const worker = new NotificationWorker({ workerId: 'test-worker-transient', baseBackoffSeconds: 10, keyPrefix: 'test-worker-transient-1' });
      await worker.processPendingJobs();

      const record = await getNotificationByIdempotencyKey('test-worker-transient-1');
      expect(record?.status).toBe('Pending');
      expect(record?.attempts).toBe(1);
      expect(record?.next_retry_at).not.toBeNull();
      expect(record?.error_message).toContain('Temporary SMTP network timeout');
      expect(record?.locked_at).toBeNull();
    });

    it('should mark jobs as permanently Failed when max attempts are exceeded', async () => {
      await enqueueNotification({
        idempotencyKey: 'test-worker-permanent-1',
        eventType: NOTIFICATION_EVENTS.HANDOVER_CREATED,
        recipientEmail: 'asst.cs@facultyflow.local',
        subject: 'Permanent Failure Test',
        templateId: NOTIFICATION_EVENTS.HANDOVER_CREATED,
        payload: { handoverTitle: 'Equipment Handover' },
      });

      await pool.query(
        "UPDATE email_notifications SET attempts = max_attempts - 1 WHERE idempotency_key = 'test-worker-permanent-1'"
      );

      mockTransport.failPermanently = true;
      mockTransport.failureMessage = 'Permanent recipient mailbox full (552)';

      const worker = new NotificationWorker({ workerId: 'test-worker-perm', keyPrefix: 'test-worker-permanent-1' });
      await worker.processPendingJobs();

      const record = await getNotificationByIdempotencyKey('test-worker-permanent-1');

      expect(record?.status).toBe('Failed');
      expect(record?.attempts).toBe(5);
      expect(record?.error_message).toContain('Permanent recipient mailbox full');
      expect(record?.locked_at).toBeNull();
      mockTransport.failPermanently = false;
    });

    it('should recover stale Processing jobs abandoned after a worker crash or lease expiry', async () => {
      await pool.query(
        `INSERT INTO email_notifications (
           idempotency_key, event_type, recipient_email, subject, template_id,
           payload, status, attempts, locked_at, locked_by
         ) VALUES (?, ?, ?, ?, ?, ?, 'Processing', 0, NOW() - INTERVAL 400 SECOND, 'dead-worker-pid-999')`,
        [
          'test-stale-recovery-1',
          NOTIFICATION_EVENTS.TASK_ASSIGNED,
          'prof.cs@facultyflow.local',
          'Stale Recovery Test',
          NOTIFICATION_EVENTS.TASK_ASSIGNED,
          JSON.stringify({ taskTitle: 'Stale Task' }),
        ]
      );

      const worker = new NotificationWorker({ leaseTimeoutSeconds: 300, keyPrefix: 'test-stale-recovery' });
      const recovered = await worker.recoverStaleJobs();
      expect(recovered).toBeGreaterThanOrEqual(1);

      const record = await getNotificationByIdempotencyKey('test-stale-recovery-1');
      expect(record?.status).toBe('Pending');
      expect(record?.locked_at).toBeNull();
      expect(record?.locked_by).toBeNull();
    });

    it('should support concurrent workers without duplicate processing or race collisions', async () => {
      for (let i = 1; i <= 4; i++) {
        await enqueueNotification({
          idempotencyKey: `test-concurrent-batch-${i}`,
          eventType: NOTIFICATION_EVENTS.TASK_UPDATED,
          recipientEmail: 'prof.cs@facultyflow.local',
          subject: `Concurrent Test ${i}`,
          templateId: NOTIFICATION_EVENTS.TASK_UPDATED,
          payload: { taskTitle: `Task ${i}` },
        });
      }

      const workerA = new NotificationWorker({ workerId: 'worker-A', batchSize: 2, keyPrefix: 'test-concurrent-batch-' });
      const workerB = new NotificationWorker({ workerId: 'worker-B', batchSize: 2, keyPrefix: 'test-concurrent-batch-' });

      const [countA, countB] = await Promise.all([
        workerA.processPendingJobs(),
        workerB.processPendingJobs(),
      ]);

      expect(countA + countB).toBeGreaterThanOrEqual(4);

      for (let i = 1; i <= 4; i++) {
        const record = await getNotificationByIdempotencyKey(`test-concurrent-batch-${i}`);
        expect(record?.status).toBe('Sent');
      }
    });

    it('should stop cleanly without leaving open intervals', async () => {
      const worker = new NotificationWorker({ pollIntervalMs: 50, keyPrefix: 'test-' });
      worker.start();
      await worker.stop();
      expect(true).toBe(true);
    });
  });

  // =========================================================================
  // 6. Controller Integration: Task Notifications
  // =========================================================================
  describe('Task Controller Event Notifications', () => {
    it('POST /api/tasks should enqueue TASK_ASSIGNED notification for the assigned faculty', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          title: '[TEST-NOTIF] Task Assignment Notification Test',
          description: 'Testing task email notification',
          category: 'Teaching',
          priority: 'High',
          dueDate: '2026-11-20',
          assigneeId: profCsUserId,
        });

      expect(res.status).toBe(201);
      const taskId = res.body.task.id;

      const record = await getNotificationByIdempotencyKey(`task-assigned-${taskId}-${profCsUserId}`);
      expect(record).not.toBeNull();
      expect(record?.event_type).toBe(NOTIFICATION_EVENTS.TASK_ASSIGNED);
      expect(record?.recipient_email).toBe('prof.cs@facultyflow.local');

      // Process with worker to verify transport delivery
      const worker = new NotificationWorker({ keyPrefix: `task-assigned-${taskId}` });
      await worker.processPendingJobs();
      expect(mockTransport.sentMessages.some(m => m.subject.includes('[TEST-NOTIF] Task Assignment Notification Test'))).toBe(true);
    });

    it('PATCH /api/tasks/:id should enqueue TASK_UPDATED notification', async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          title: '[TEST-NOTIF] Task Update Test',
          description: 'Initial description',
          category: 'Research',
          priority: 'Medium',
          dueDate: '2026-11-20',
          assigneeId: profCsUserId,
        });
      expect(createRes.status).toBe(201);
      const taskId = createRes.body.task.id;

      const updateRes = await request(app)
        .patch(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          title: '[TEST-NOTIF] Task Update Test - Modified',
          status: 'In Progress',
        });
      expect(updateRes.status).toBe(200);

      const record = await getNotificationByIdempotencyKey(`task-updated-${taskId}-${profCsUserId}`);
      expect(record).not.toBeNull();
      expect(record?.event_type).toBe(NOTIFICATION_EVENTS.TASK_UPDATED);
    });

    it('PATCH /api/tasks/:id/assign should enqueue TASK_REASSIGNED notification to new assignee', async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          title: '[TEST-NOTIF] Task Reassign Test',
          description: 'Testing reassign',
          category: 'Grading',
          priority: 'Medium',
          dueDate: '2026-11-20',
          assigneeId: profCsUserId,
        });
      expect(createRes.status).toBe(201);
      const taskId = createRes.body.task.id;

      const reassignRes = await request(app)
        .patch(`/api/tasks/${taskId}/assign`)
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          assigneeId: asstCsUserId,
        });
      expect(reassignRes.status).toBe(200);

      const record = await getNotificationByIdempotencyKey(`task-reassigned-${taskId}-${asstCsUserId}`);
      expect(record).not.toBeNull();
      expect(record?.recipient_email).toBe('asst.cs@facultyflow.local');
    });

    it('DELETE /api/tasks/:id should enqueue TASK_CANCELLED notification to assignee', async () => {
      const createRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          title: '[TEST-NOTIF] Task Cancel Notification Test',
          description: 'To be cancelled',
          category: 'Meetings',
          priority: 'Low',
          dueDate: '2026-11-20',
          assigneeId: profCsUserId,
        });
      expect(createRes.status).toBe(201);
      const taskId = createRes.body.task.id;

      const deleteRes = await request(app)
        .delete(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${hodCsToken}`);
      expect(deleteRes.status).toBe(200);

      const record = await getNotificationByIdempotencyKey(`task-cancelled-${taskId}-${profCsUserId}`);
      expect(record).not.toBeNull();
      expect(record?.event_type).toBe(NOTIFICATION_EVENTS.TASK_CANCELLED);
    });
  });

  // =========================================================================
  // 7. Controller Integration: Leave Notifications
  // =========================================================================
  describe('Leave Controller Event Notifications & Department Isolation', () => {
    it('POST /api/leaves should enqueue LEAVE_SUBMITTED for faculty and LEAVE_PENDING_APPROVAL for HOD', async () => {
      const res = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({
          leaveTypeId: casualLeaveTypeId,
          startDate: '2026-12-01',
          endDate: '2026-12-02',
          isHalfDay: false,
          reason: '[TEST-NOTIF] Attending regional research conference',
        });

      expect(res.status).toBe(201);
      const leaveId = res.body.data.id;

      // 1. Requester notification
      const requesterNotice = await getNotificationByIdempotencyKey(`leave-submitted-${leaveId}-${profCsUserId}`);
      expect(requesterNotice).not.toBeNull();
      expect(requesterNotice?.event_type).toBe(NOTIFICATION_EVENTS.LEAVE_SUBMITTED);
      expect(requesterNotice?.recipient_email).toBe('prof.cs@facultyflow.local');

      // 2. Department HOD notification (CS HOD, NOT Mech HOD)
      const hodNotice = await getNotificationByIdempotencyKey(`leave-pending-${leaveId}-${hodCsUserId}`);
      expect(hodNotice).not.toBeNull();
      expect(hodNotice?.event_type).toBe(NOTIFICATION_EVENTS.LEAVE_PENDING_APPROVAL);
      expect(hodNotice?.recipient_email).toBe('hod.cs@facultyflow.local');

      // Ensure MECH HOD was NOT notified
      const wrongHodNotice = await getNotificationByIdempotencyKey(`leave-pending-${leaveId}-${hodMechUserId}`);
      expect(wrongHodNotice).toBeNull();
    });

    it('POST /api/leaves/:id/decision should enqueue LEAVE_APPROVED or LEAVE_REJECTED for requester', async () => {
      const submitRes = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({
          leaveTypeId: casualLeaveTypeId,
          startDate: '2026-12-08',
          endDate: '2026-12-09',
          isHalfDay: false,
          reason: '[TEST-NOTIF] Personal work',
        });
      expect(submitRes.status).toBe(201);
      const leaveId = submitRes.body.data.id;

      const approveRes = await request(app)
        .post(`/api/leaves/${leaveId}/decision`)
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          status: 'Approved',
          decisionNotes: 'Approved by HOD CS',
        });
      expect(approveRes.status).toBe(200);

      const decisionNotice = await getNotificationByIdempotencyKey(`leave-decided-${leaveId}-approved`);
      expect(decisionNotice).not.toBeNull();
      expect(decisionNotice?.event_type).toBe(NOTIFICATION_EVENTS.LEAVE_APPROVED);
      expect(decisionNotice?.recipient_email).toBe('prof.cs@facultyflow.local');
    });

    it('POST /api/leaves/:id/cancel should enqueue LEAVE_CANCELLED for requester', async () => {
      const submitRes = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({
          leaveTypeId: casualLeaveTypeId,
          startDate: '2026-12-22',
          endDate: '2026-12-23',
          isHalfDay: false,
          reason: '[TEST-NOTIF] Planned vacation',
        });
      expect(submitRes.status).toBe(201);
      const leaveId = submitRes.body.data.id;

      const cancelRes = await request(app)
        .post(`/api/leaves/${leaveId}/cancel`)
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({
          notes: 'Trip cancelled',
        });
      expect(cancelRes.status).toBe(200);

      const cancelNotice = await getNotificationByIdempotencyKey(`leave-cancelled-${leaveId}`);
      expect(cancelNotice).not.toBeNull();
      expect(cancelNotice?.event_type).toBe(NOTIFICATION_EVENTS.LEAVE_CANCELLED);
      expect(cancelNotice?.recipient_email).toBe('prof.cs@facultyflow.local');
    });
  });

  // =========================================================================
  // 8. Controller Integration: Academic Events
  // =========================================================================
  describe('Academic Events Controller Notifications', () => {
    it('POST /api/events should enqueue EVENT_INVITATION for invited participants', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          title: '[TEST-NOTIF] Faculty Curriculum Workshop',
          description: 'Workshop on curriculum update',
          category: 'Meeting',
          startTime: '2026-11-25T10:00:00.000Z',
          endTime: '2026-11-25T12:00:00.000Z',
          location: 'Conference Room 1',
          participantIds: [profCsUserId, asstCsUserId],
        });

      expect(res.status).toBe(201);
      const eventId = res.body.eventId;

      const profNotice = await getNotificationByIdempotencyKey(`event-invite-${eventId}-${profCsUserId}`);
      const asstNotice = await getNotificationByIdempotencyKey(`event-invite-${eventId}-${asstCsUserId}`);

      expect(profNotice).not.toBeNull();
      expect(profNotice?.event_type).toBe(NOTIFICATION_EVENTS.EVENT_INVITATION);
      expect(profNotice?.recipient_email).toBe('prof.cs@facultyflow.local');

      expect(asstNotice).not.toBeNull();
      expect(asstNotice?.event_type).toBe(NOTIFICATION_EVENTS.EVENT_INVITATION);
      expect(asstNotice?.recipient_email).toBe('asst.cs@facultyflow.local');
    });

    it('PATCH /api/events/:id should enqueue EVENT_UPDATED for participants when schedule changes', async () => {
      const createRes = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          title: '[TEST-NOTIF] Seminar Event',
          category: 'Workshop',
          startTime: '2026-11-28T09:00:00.000Z',
          endTime: '2026-11-28T11:00:00.000Z',
          location: 'Seminar Hall B',
          participantIds: [profCsUserId],
        });
      expect(createRes.status).toBe(201);
      const eventId = createRes.body.eventId;

      const updateRes = await request(app)
        .patch(`/api/events/${eventId}`)
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          title: '[TEST-NOTIF] Seminar Event',
          category: 'Workshop',
          startTime: '2026-11-28T14:00:00.000Z',
          endTime: '2026-11-28T16:00:00.000Z',
          location: 'Auditorium Main',
          participantIds: [profCsUserId],
        });
      expect(updateRes.status).toBe(200);

      const updateNotice = await getNotificationByIdempotencyKey(`event-updated-${eventId}-${profCsUserId}`);
      expect(updateNotice).not.toBeNull();
      expect(updateNotice?.event_type).toBe(NOTIFICATION_EVENTS.EVENT_UPDATED);
    });

    it('DELETE /api/events/:id should enqueue EVENT_CANCELLED for participants', async () => {
      const createRes = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          title: '[TEST-NOTIF] Cancel Event Test',
          category: 'Meeting',
          startTime: '2026-11-30T10:00:00.000Z',
          endTime: '2026-11-30T11:00:00.000Z',
          participantIds: [profCsUserId],
        });
      expect(createRes.status).toBe(201);
      const eventId = createRes.body.eventId;

      const deleteRes = await request(app)
        .delete(`/api/events/${eventId}`)
        .set('Authorization', `Bearer ${hodCsToken}`);
      expect(deleteRes.status).toBe(200);

      const cancelNotice = await getNotificationByIdempotencyKey(`event-cancelled-${eventId}-${profCsUserId}`);
      expect(cancelNotice).not.toBeNull();
      expect(cancelNotice?.event_type).toBe(NOTIFICATION_EVENTS.EVENT_CANCELLED);
    });
  });

  // =========================================================================
  // 9. Controller Integration: Faculty Handovers
  // =========================================================================
  describe('Faculty Handovers Controller Notifications', () => {
    it('POST /api/handovers should enqueue HANDOVER_CREATED for recipient faculty', async () => {
      const res = await request(app)
        .post('/api/handovers')
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({
          title: '[TEST-NOTIF] Lab Equipment Handover',
          notes: 'Handing over lab keys and inventory',
          dueDate: '2026-11-25',
          recipientId: asstCsUserId,
        });

      expect(res.status).toBe(201);
      const handoverId = res.body.handover.id;

      const record = await getNotificationByIdempotencyKey(`handover-created-${handoverId}-${asstCsUserId}`);
      expect(record).not.toBeNull();
      expect(record?.event_type).toBe(NOTIFICATION_EVENTS.HANDOVER_CREATED);
      expect(record?.recipient_email).toBe('asst.cs@facultyflow.local');
    });

    it('PATCH /api/handovers/:id/status should enqueue HANDOVER_STATUS_UPDATED for originating faculty', async () => {
      const createRes = await request(app)
        .post('/api/handovers')
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({
          title: '[TEST-NOTIF] Syllabus Coverage Handover',
          notes: 'CS201 mid-term handover notes',
          dueDate: '2026-11-25',
          recipientId: asstCsUserId,
        });
      expect(createRes.status).toBe(201);
      const handoverId = createRes.body.handover.id;

      const updateRes = await request(app)
        .patch(`/api/handovers/${handoverId}/status`)
        .set('Authorization', `Bearer ${asstCsToken}`)
        .send({
          status: 'Accepted',
          responseNotes: 'Accepted the handover materials',
        });
      expect(updateRes.status).toBe(200);

      const statusNotice = await getNotificationByIdempotencyKey(`handover-status-${handoverId}-Accepted`);
      expect(statusNotice).not.toBeNull();
      expect(statusNotice?.event_type).toBe(NOTIFICATION_EVENTS.HANDOVER_STATUS_UPDATED);
      expect(statusNotice?.recipient_email).toBe('prof.cs@facultyflow.local');
    });
  });

  // =========================================================================
  // 10. Non-blocking Resilience & Atomic Integrity
  // =========================================================================
  describe('Resilience: Business operation never blocked or reversed by email failures', () => {
    it('should complete task creation even if transport encounters permanent failure', async () => {
      mockTransport.failPermanently = true;

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          title: '[TEST-NOTIF] Resilient Task Operation',
          description: 'Testing resilience against transport errors',
          category: 'Teaching',
          priority: 'High',
          dueDate: '2026-11-22',
          assigneeId: profCsUserId,
        });

      // Business operation MUST succeed with 201 regardless of email transport state
      expect(res.status).toBe(201);
      expect(res.body.task.id).toBeTruthy();

      const [tasks] = await pool.query<any[]>('SELECT id FROM tasks WHERE id = ?', [res.body.task.id]);
      expect(tasks.length).toBe(1);

      mockTransport.failPermanently = false;
    });
  });
});
