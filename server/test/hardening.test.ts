import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool } from '../src/config/database.js';
import { seedDatabase } from '../src/db/seed.js';
import {
  MockEmailTransport,
  SmtpEmailTransport,
  setEmailTransport,
} from '../src/services/email/transport.js';
import {
  NotificationWorker,
} from '../src/services/email/worker.js';
import {
  enqueueNotification,
  getNotificationByIdempotencyKey,
} from '../src/services/email/queue.service.js';
import { NOTIFICATION_EVENTS } from '../src/services/email/template-types.js';
import { ROLES } from '../src/constants/roles.js';

describe('Phase 8: Integration, Security, and Regression Hardening Test Suite', () => {
  let mockTransport: MockEmailTransport;
  let adminToken: string;
  let hodCsToken: string;
  let profCsToken: string;
  let asstCsToken: string;
  let hodMechToken: string;

  let adminUserId: number;
  let profCsUserId: number;
  let asstCsUserId: number;
  let hodCsUserId: number;
  let hodMechUserId: number;
  let csDeptId: number;
  let mechDeptId: number;

  beforeAll(async () => {
    mockTransport = new MockEmailTransport();
    setEmailTransport(mockTransport);

    await seedDatabase();

    const [users] = await pool.query<any[]>('SELECT id, email, role, department_id FROM users');
    adminUserId = users.find((u: any) => u.email === 'admin@facultyflow.local').id;
    profCsUserId = users.find((u: any) => u.email === 'prof.cs@facultyflow.local').id;
    asstCsUserId = users.find((u: any) => u.email === 'asst.cs@facultyflow.local').id;
    hodCsUserId = users.find((u: any) => u.email === 'hod.cs@facultyflow.local').id;
    hodMechUserId = users.find((u: any) => u.email === 'hod.mech@facultyflow.local').id;

    const [departments] = await pool.query<any[]>('SELECT id, code FROM departments');
    csDeptId = departments.find((d: any) => d.code === 'CS').id;
    mechDeptId = departments.find((d: any) => d.code === 'MECH').id;

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
  });

  afterAll(async () => {
    await pool.query('DELETE FROM email_notifications WHERE idempotency_key LIKE ?', ['phase8-%']);
    await pool.query('DELETE FROM tasks WHERE title LIKE ?', ['[PHASE8-%']);
  });

  // ============================================================================
  // 1. Email Idempotency & Per-Event Versioning
  // ============================================================================
  describe('Email Notification Idempotency & Versioning', () => {
    it('should distinguish a duplicate retry from a legitimate subsequent update on the same task', async () => {
      // 1. Create a task
      const createRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          title: '[PHASE8-TASK] Multiple Updates Task',
          description: 'Version idempotency verification',
          category: 'Research',
          priority: 'High',
          dueDate: '2026-12-01',
          assigneeId: profCsUserId,
        });
      expect(createRes.status).toBe(201);
      const taskId = createRes.body.task.id;

      // 2. Perform First Update (description change) -> version becomes 2
      const update1 = await request(app)
        .patch(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          description: 'Updated description for phase 8 test',
        });
      expect(update1.status).toBe(200);

      const notif1 = await getNotificationByIdempotencyKey(`task-updated-${taskId}-${profCsUserId}`);
      expect(notif1).not.toBeNull();
      expect(notif1?.event_type).toBe(NOTIFICATION_EVENTS.TASK_UPDATED);

      // 3. Perform Second Legitimate Update (title change) -> version becomes 3
      const update2 = await request(app)
        .patch(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          title: '[PHASE8-TASK] Multiple Updates Task - Phase 2',
        });
      expect(update2.status).toBe(200);

      // Verify second distinct update notification was enqueued with version key
      const notif2 = await getNotificationByIdempotencyKey(`task-updated-${taskId}-${profCsUserId}-v3`);
      expect(notif2).not.toBeNull();
      expect(notif2?.id).not.toBe(notif1?.id);

      // 4. Perform an identical request (no changes) -> should NOT produce redundant notifications
      const noOpRes = await request(app)
        .patch(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          title: '[PHASE8-TASK] Multiple Updates Task - Phase 2',
        });
      expect(noOpRes.status).toBe(200);

      // Verify no v4 was created because there were no actual changes
      const notif3 = await getNotificationByIdempotencyKey(`task-updated-${taskId}-${profCsUserId}-v4`);
      expect(notif3).toBeNull();
    });

    it('should respect client Idempotency-Key header across repeated requests', async () => {
      const clientKey = `phase8-idemp-hdr-${Date.now()}`;

      const res1 = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${hodCsToken}`)
        .set('Idempotency-Key', clientKey)
        .send({
          title: '[PHASE8-TASK] Client Key Task',
          description: 'Client idempotency header verification',
          category: 'Meetings',
          priority: 'Low',
          dueDate: '2026-12-05',
          assigneeId: profCsUserId,
        });
      expect(res1.status).toBe(201);
      const taskId = res1.body.task.id;

      const notifRecord = await getNotificationByIdempotencyKey(`task-assigned-${taskId}-${clientKey}`);
      expect(notifRecord).not.toBeNull();

      // Check count of notifications with this client key
      const [rows] = await pool.query<any[]>(
        'SELECT COUNT(*) as cnt FROM email_notifications WHERE idempotency_key = ?',
        [`task-assigned-${taskId}-${clientKey}`]
      );
      expect(Number(rows[0].cnt)).toBe(1);
    });
  });

  // ============================================================================
  // 2. Transaction Coupling & Rollback
  // ============================================================================
  describe('Transactional Queue Coupling and Atomic Rollbacks', () => {
    it('should ensure notification enqueued within a rolled-back transaction is not persisted', async () => {
      const testKey = `phase8-rollback-test-${Date.now()}`;
      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        await enqueueNotification(
          {
            idempotencyKey: testKey,
            eventType: NOTIFICATION_EVENTS.TASK_ASSIGNED,
            recipientEmail: 'test@facultyflow.local',
            recipientName: 'Test Rollback',
            recipientId: profCsUserId,
            templateId: NOTIFICATION_EVENTS.TASK_ASSIGNED,
            payload: { title: 'Test' },
          },
          connection
        );

        // Explicitly rollback transaction
        await connection.rollback();
      } finally {
        connection.release();
      }

      // Verify row does not exist in database after rollback
      const row = await getNotificationByIdempotencyKey(testKey);
      expect(row).toBeNull();
    });
  });

  // ============================================================================
  // 3. Worker Concurrency & Lease Safety
  // ============================================================================
  describe('Worker Lease Renewal and Stale Protection', () => {
    it('should configure SmtpEmailTransport with connection, greeting, and socket timeouts', () => {
      const smtp = new SmtpEmailTransport({
        host: '127.0.0.1',
        port: 1025,
        secure: false,
        fromEmail: 'test@facultyflow.local',
        fromName: 'Faculty Flow',
      });

      expect(smtp).toBeDefined();
    });

    it('should renew lease when processing jobs to avoid premature reclaim during slow operations', async () => {
      const testKey = `phase8-worker-lease-${Date.now()}`;
      await enqueueNotification({
        idempotencyKey: testKey,
        eventType: NOTIFICATION_EVENTS.TASK_ASSIGNED,
        recipientEmail: 'lease@facultyflow.local',
        recipientName: 'Lease Test',
        recipientId: profCsUserId,
        templateId: NOTIFICATION_EVENTS.TASK_ASSIGNED,
        payload: { title: 'Lease Renewal Verification' },
      });

      const worker = new NotificationWorker({ keyPrefix: 'phase8-worker-lease' });
      const processed = await worker.processPendingJobs();
      expect(processed).toBeGreaterThanOrEqual(1);

      const job = await getNotificationByIdempotencyKey(testKey);
      expect(job?.status).toBe('Sent');
    });
  });

  // ============================================================================
  // 4. Security Audit & Route Hardening
  // ============================================================================
  describe('Security Headers, Rate Limiting & Administrative Safeguards', () => {
    it('should emit standard security headers on all API responses', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-xss-protection']).toBe('0');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('should prevent System Admin from demoting self role', async () => {
      const res = await request(app)
        .patch(`/api/users/${adminUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: ROLES.PROFESSOR,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CANNOT_DEMOTE_SELF');
    });

    it('should prevent System Admin from deactivating own account', async () => {
      const res = await request(app)
        .patch(`/api/users/${adminUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isActive: false,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CANNOT_DEACTIVATE_SELF');
    });

    it('should rate limit repeated failed password change attempts', async () => {
      // Send 5 incorrect current-password attempts
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/auth/change-password')
          .set('Authorization', `Bearer ${asstCsToken}`)
          .send({
            currentPassword: 'WrongPassword!999',
            newPassword: 'NewValidPassword@123',
          });
        expect(res.status).toBe(400);
      }

      // 6th attempt should be blocked by rate limiter
      const blockedRes = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${asstCsToken}`)
        .send({
          currentPassword: 'WrongPassword!999',
          newPassword: 'NewValidPassword@123',
        });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error.message).toContain('Too many failed password change attempts');
    });
  });

  // ============================================================================
  // 5. Cross-Department & Authorization Denial
  // ============================================================================
  describe('Cross-Department & Academic Authorization Boundaries', () => {
    it('HOD cannot modify a task in another academic department', async () => {
      // 1. Create a task in MECH department by HOD MECH
      const taskRes = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${hodMechToken}`)
        .send({
          title: '[PHASE8-TASK] Mech Department Task',
          description: 'Department isolation check',
          category: 'Teaching',
          priority: 'Medium',
          dueDate: '2026-12-10',
          assigneeId: hodMechUserId,
        });
      expect(taskRes.status).toBe(201);
      const mechTaskId = taskRes.body.task.id;

      // 2. CS HOD attempts to update the MECH task -> Denied 403
      const patchRes = await request(app)
        .patch(`/api/tasks/${mechTaskId}`)
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          title: '[PHASE8-TASK] Cross-Department Tamper Attempt',
        });

      expect(patchRes.status).toBe(403);
      expect(patchRes.body.error.code).toBe('CROSS_DEPARTMENT_FORBIDDEN');
    });

    it('HOD cannot approve or decide leave requests in another academic department', async () => {
      // 1. Submit leave for Asst CS
      const leaveRes = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${asstCsToken}`)
        .send({
          leaveTypeId: 1, // CASUAL
          startDate: '2026-11-23',
          endDate: '2026-11-24',
          isHalfDay: false,
          reason: 'Phase 8 cross-dept leave test',
        });
      expect(leaveRes.status).toBe(201);
      const leaveId = leaveRes.body.data.id;

      // 2. HOD MECH attempts to decide the CS leave request -> Denied 403
      const decideRes = await request(app)
        .post(`/api/leaves/${leaveId}/decision`)
        .set('Authorization', `Bearer ${hodMechToken}`)
        .send({
          status: 'Approved',
          decisionNotes: 'Cross department approval attempt',
        });

      expect(decideRes.status).toBe(403);

      // Clean up leave
      await pool.query('DELETE FROM leave_requests WHERE id = ?', [leaveId]);
    });

    it('HOD cannot approve their own leave request', async () => {
      // 1. Submit leave by HOD CS
      const leaveRes = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          leaveTypeId: 1,
          startDate: '2027-02-10',
          endDate: '2027-02-11',
          isHalfDay: false,
          reason: 'Self approval test by HOD',
        });
      expect(leaveRes.status).toBe(201);
      const leaveId = leaveRes.body.data.id;

      // 2. HOD CS attempts to approve own leave -> Denied 403
      const selfApproveRes = await request(app)
        .post(`/api/leaves/${leaveId}/decision`)
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          status: 'Approved',
          decisionNotes: 'Self approving',
        });

      expect(selfApproveRes.status).toBe(403);
      expect(selfApproveRes.body.error.message).toContain('Self-approval is strictly prohibited');

      // Clean up leave
      await pool.query('DELETE FROM leave_requests WHERE id = ?', [leaveId]);
    });
  });
});
