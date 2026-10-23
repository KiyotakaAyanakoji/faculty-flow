import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { seedDatabase } from '../src/db/seed.js';
import { pool } from '../src/config/database.js';

describe('Faculty Leave Management API Test Suite (Phase 6)', () => {
  let adminToken: string;
  let hodCsToken: string;
  let profCsToken: string;
  let asstCsToken: string;
  let hodMechToken: string;
  let asstLeadCsToken: string;

  let profCsUserId: number;
  let asstCsUserId: number;
  let asstLeadCsUserId: number;
  let hodCsUserId: number;
  let hodMechUserId: number;

  let casualLeaveTypeId: number;
  let sickLeaveTypeId: number;
  let earnedLeaveTypeId: number;
  let unpaidLeaveTypeId: number;

  beforeAll(async () => {
    await pool.query('DELETE FROM leave_audit_logs');
    await pool.query('DELETE FROM leave_requests');
    await seedDatabase();

    const [users] = await pool.query<any[]>('SELECT id, email FROM users');
    profCsUserId = users.find((u: any) => u.email === 'prof.cs@facultyflow.local').id;
    asstCsUserId = users.find((u: any) => u.email === 'asst.cs@facultyflow.local').id;
    hodCsUserId = users.find((u: any) => u.email === 'hod.cs@facultyflow.local').id;
    hodMechUserId = users.find((u: any) => u.email === 'hod.mech@facultyflow.local').id;
    asstLeadCsUserId = users.find((u: any) => u.email === 'asst.lead.cs@facultyflow.local').id;

    const [leaveTypes] = await pool.query<any[]>('SELECT id, code FROM leave_types');
    casualLeaveTypeId = leaveTypes.find((lt: any) => lt.code === 'CASUAL').id;
    sickLeaveTypeId = leaveTypes.find((lt: any) => lt.code === 'SICK').id;
    earnedLeaveTypeId = leaveTypes.find((lt: any) => lt.code === 'EARNED').id;
    unpaidLeaveTypeId = leaveTypes.find((lt: any) => lt.code === 'UNPAID').id;

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
    asstLeadCsToken = await getToken('asst.lead.cs@facultyflow.local');
  });

  afterAll(async () => {
    await pool.query('DELETE FROM leave_audit_logs');
    await pool.query('DELETE FROM leave_requests');
  });

  describe('1. Leave Request Submission & Calculation', () => {
    it('GET /api/leaves/types - should return all configured leave types', async () => {
      const res = await request(app)
        .get('/api/leaves/types')
        .set('Authorization', `Bearer ${profCsToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(4);
      const codes = res.body.data.map((t: any) => t.code);
      expect(codes).toContain('CASUAL');
      expect(codes).toContain('SICK');
      expect(codes).toContain('UNPAID');
    });

    it('GET /api/leaves/calculate - should calculate duration excluding Sundays', async () => {
      // 2026-11-02 is Monday, 2026-11-03 is Tuesday (2 working days)
      const res = await request(app)
        .get('/api/leaves/calculate?startDate=2026-11-02&endDate=2026-11-03')
        .set('Authorization', `Bearer ${profCsToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.daysCount).toBe(2);

      // Half-day calculation
      const halfDayRes = await request(app)
        .get('/api/leaves/calculate?startDate=2026-11-02&endDate=2026-11-02&isHalfDay=true')
        .set('Authorization', `Bearer ${profCsToken}`);

      expect(halfDayRes.status).toBe(200);
      expect(halfDayRes.body.data.daysCount).toBe(0.5);
    });

    it('POST /api/leaves - should successfully submit paid leave and reserve pending balance', async () => {
      // Check initial balance
      const initialBalRes = await request(app)
        .get('/api/leaves/balances')
        .set('Authorization', `Bearer ${profCsToken}`);

      const casualBefore = initialBalRes.body.data.find((b: any) => b.leave_type_code === 'CASUAL');
      const pendingBefore = casualBefore.pending_days;

      const res = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({
          leaveTypeId: casualLeaveTypeId,
          startDate: '2026-11-02',
          endDate: '2026-11-03',
          isHalfDay: false,
          reason: 'Attending IEEE international research workshop in Bangalore',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Pending');
      expect(res.body.data.daysCount).toBe(2);

      // Verify pending balance reserved
      const afterBalRes = await request(app)
        .get('/api/leaves/balances')
        .set('Authorization', `Bearer ${profCsToken}`);
      const casualAfter = afterBalRes.body.data.find((b: any) => b.leave_type_code === 'CASUAL');
      expect(casualAfter.pending_days).toBe(pendingBefore + 2);
    });

    it('POST /api/leaves - should reject overlapping leave requests', async () => {
      // Attempting to submit another leave on 2026-11-02
      const res = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({
          leaveTypeId: casualLeaveTypeId,
          startDate: '2026-11-02',
          endDate: '2026-11-04',
          isHalfDay: false,
          reason: 'Duplicate overlapping request',
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.message || res.body.message).toContain('overlapping');
    });

    it('POST /api/leaves - should reject invalid dates and invalid schemas', async () => {
      // Start date after end date
      const res1 = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({
          leaveTypeId: casualLeaveTypeId,
          startDate: '2026-11-10',
          endDate: '2026-11-05',
          isHalfDay: false,
          reason: 'Invalid inverted dates',
        });

      expect(res1.status).toBe(400);

      // Half-day spanning multiple dates
      const res2 = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({
          leaveTypeId: casualLeaveTypeId,
          startDate: '2026-11-05',
          endDate: '2026-11-06',
          isHalfDay: true,
          halfDayPeriod: 'First Half',
          reason: 'Invalid multi-day half-day',
        });

      expect(res2.status).toBe(400);

      // Non-existent leave type
      const res3 = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({
          leaveTypeId: 999999,
          startDate: '2026-11-05',
          endDate: '2026-11-05',
          isHalfDay: false,
          reason: 'Invalid leave type test',
        });

      expect(res3.status).toBe(404);
    });

    it('POST /api/leaves - should support half-day leave with period specification', async () => {
      const res = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({
          leaveTypeId: casualLeaveTypeId,
          startDate: '2026-11-06',
          endDate: '2026-11-06',
          isHalfDay: true,
          halfDayPeriod: 'First Half',
          reason: 'Family appointment in the morning',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.daysCount).toBe(0.5);
      expect(res.body.data.isHalfDay).toBe(true);
      expect(res.body.data.halfDayPeriod).toBe('First Half');
    });
  });

  describe('2. Entitlements, Balance Limits & Unpaid Leave', () => {
    it('POST /api/leaves - should reject request exceeding available paid balance', async () => {
      // Casual leave entitlement is 12 days. Let's try requesting 25 days (overspend).
      // Monday 2026-11-09 to Friday 2026-12-11 is ~29 working days
      const res = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({
          leaveTypeId: casualLeaveTypeId,
          startDate: '2026-11-09',
          endDate: '2026-12-11',
          isHalfDay: false,
          reason: 'Excessive vacation duration beyond entitlement',
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.message || res.body.message).toContain('Insufficient leave balance');
    });

    it('POST /api/leaves - unpaid leave should succeed and not deduct paid balances', async () => {
      // Check paid balances before unpaid leave
      const beforeBalRes = await request(app)
        .get('/api/leaves/balances')
        .set('Authorization', `Bearer ${profCsToken}`);
      const paidBalancesBefore = beforeBalRes.body.data
        .filter((b: any) => b.is_paid)
        .map((b: any) => ({ code: b.leave_type_code, pending: b.pending_days, used: b.used_days }));

      const res = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({
          leaveTypeId: unpaidLeaveTypeId,
          startDate: '2026-12-14',
          endDate: '2026-12-18',
          isHalfDay: false,
          reason: 'Unpaid sabbatical period for external research monograph',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('Pending');

      // Verify paid balances were untouched
      const afterBalRes = await request(app)
        .get('/api/leaves/balances')
        .set('Authorization', `Bearer ${profCsToken}`);
      const paidBalancesAfter = afterBalRes.body.data
        .filter((b: any) => b.is_paid)
        .map((b: any) => ({ code: b.leave_type_code, pending: b.pending_days, used: b.used_days }));

      expect(paidBalancesAfter).toEqual(paidBalancesBefore);
    });
  });

  describe('3. Department Isolation, Security & Privacy Checks', () => {
    let csRequestId: number;

    beforeAll(async () => {
      // Submit a leave request by Prof CS
      const res = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({
          leaveTypeId: sickLeaveTypeId,
          startDate: '2026-11-20',
          endDate: '2026-11-20',
          isHalfDay: false,
          reason: 'Medical consultation at hospital',
        });
      csRequestId = res.body.data.id;
    });

    it('GET /api/leaves/:id - requester can view their own sensitive request', async () => {
      const res = await request(app)
        .get(`/api/leaves/${csRequestId}`)
        .set('Authorization', `Bearer ${profCsToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.reason).toBe('Medical consultation at hospital');
    });

    it('GET /api/leaves/:id - unauthorized faculty member cannot view another faculty leave (403)', async () => {
      const res = await request(app)
        .get(`/api/leaves/${csRequestId}`)
        .set('Authorization', `Bearer ${asstCsToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error?.message || res.body.message).toContain('not authorized to view');
    });

    it('GET /api/leaves/:id - cross-department faculty cannot view request (403)', async () => {
      const res = await request(app)
        .get(`/api/leaves/${csRequestId}`)
        .set('Authorization', `Bearer ${hodMechToken}`);

      expect(res.status).toBe(403);
    });

    it('GET /api/leaves/approvals - Assistant Professor and Professor cannot access HOD approval queue (403)', async () => {
      const resProf = await request(app)
        .get('/api/leaves/approvals')
        .set('Authorization', `Bearer ${profCsToken}`);
      expect(resProf.status).toBe(403);

      const resAsst = await request(app)
        .get('/api/leaves/approvals')
        .set('Authorization', `Bearer ${asstCsToken}`);
      expect(resAsst.status).toBe(403);
    });
  });

  describe('4. Approval Workflow, State Machine & Permissions', () => {
    let pendingRequestId: number;

    beforeAll(async () => {
      // Submit request by Asst Prof CS
      const res = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${asstCsToken}`)
        .send({
          leaveTypeId: casualLeaveTypeId,
          startDate: '2026-11-24',
          endDate: '2026-11-25',
          isHalfDay: false,
          reason: 'Family wedding event in Chennai',
        });
      pendingRequestId = res.body.data.id;
    });

    it('POST /api/leaves/:id/decision - Professor cannot approve leave (403)', async () => {
      const res = await request(app)
        .post(`/api/leaves/${pendingRequestId}/decision`)
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({
          status: 'Approved',
          decisionNotes: 'Attempted approval by Professor',
        });

      expect(res.status).toBe(403);
      expect(res.body.error?.message || res.body.message).toMatch(/Forbidden|Only the Head of Department/i);
    });

    it('POST /api/leaves/:id/decision - System Admin cannot bypass approval workflow (403)', async () => {
      const res = await request(app)
        .post(`/api/leaves/${pendingRequestId}/decision`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'Approved',
          decisionNotes: 'Admin override attempt',
        });

      expect(res.status).toBe(403);
      expect(res.body.error?.message || res.body.message).toMatch(/Forbidden|Only the Head of Department/i);
    });

    it('POST /api/leaves/:id/decision - Cross-department HOD cannot approve request (403)', async () => {
      // MECH HOD trying to approve CS request
      const res = await request(app)
        .post(`/api/leaves/${pendingRequestId}/decision`)
        .set('Authorization', `Bearer ${hodMechToken}`)
        .send({
          status: 'Approved',
          decisionNotes: 'Cross-department approval attempt',
        });

      expect(res.status).toBe(403);
      expect(res.body.error?.message || res.body.message).toContain('Cross-department leave approval is strictly prohibited');
    });

    it('POST /api/leaves/:id/decision - HOD cannot approve their own leave request (403)', async () => {
      // Submit leave as HOD CS
      const hodReqRes = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          leaveTypeId: casualLeaveTypeId,
          startDate: '2026-11-27',
          endDate: '2026-11-27',
          isHalfDay: false,
          reason: 'HOD personal day',
        });
      const hodReqId = hodReqRes.body.data.id;

      // Attempt self-approval
      const selfApproveRes = await request(app)
        .post(`/api/leaves/${hodReqId}/decision`)
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          status: 'Approved',
          decisionNotes: 'Approving my own leave',
        });

      expect(selfApproveRes.status).toBe(403);
      expect(selfApproveRes.body.error?.message || selfApproveRes.body.message).toContain('Self-approval is strictly prohibited');
    });

    it('POST /api/leaves/:id/decision - HOD CS approves CS request, moves pending balance to used balance', async () => {
      // Check Asst CS balances before approval
      const beforeBal = await request(app)
        .get('/api/leaves/balances')
        .set('Authorization', `Bearer ${asstCsToken}`);
      const casualBefore = beforeBal.body.data.find((b: any) => b.leave_type_code === 'CASUAL');
      const pendingBefore = casualBefore.pending_days;
      const usedBefore = casualBefore.used_days;

      const res = await request(app)
        .post(`/api/leaves/${pendingRequestId}/decision`)
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          status: 'Approved',
          decisionNotes: 'Approved. Please arrange alternate lab coverage.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Approved');

      // Check Asst CS balances after approval
      const afterBal = await request(app)
        .get('/api/leaves/balances')
        .set('Authorization', `Bearer ${asstCsToken}`);
      const casualAfter = afterBal.body.data.find((b: any) => b.leave_type_code === 'CASUAL');

      // 2 days should move from pending_days to used_days
      expect(casualAfter.pending_days).toBe(pendingBefore - 2);
      expect(casualAfter.used_days).toBe(usedBefore + 2);
    });

    it('POST /api/leaves/:id/decision - Duplicate approval is rejected (invalid state transition)', async () => {
      const res = await request(app)
        .post(`/api/leaves/${pendingRequestId}/decision`)
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          status: 'Approved',
          decisionNotes: 'Duplicate approval attempt',
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.message || res.body.message).toContain('Invalid state transition');
    });
  });

  describe('5. Cancellation & Rejection Balance Restoration', () => {
    it('Rejection should release pending reservation without incrementing used balance', async () => {
      // Submit a 1-day request
      const submitRes = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${asstCsToken}`)
        .send({
          leaveTypeId: sickLeaveTypeId,
          startDate: '2026-12-01',
          endDate: '2026-12-01',
          isHalfDay: false,
          reason: 'Mild fever checkup',
        });
      const reqId = submitRes.body.data.id;

      // Balances during pending state
      const midBal = await request(app)
        .get('/api/leaves/balances')
        .set('Authorization', `Bearer ${asstCsToken}`);
      const sickMid = midBal.body.data.find((b: any) => b.leave_type_code === 'SICK');
      const pendingMid = sickMid.pending_days;
      const usedMid = sickMid.used_days;

      // HOD Rejects
      const rejectRes = await request(app)
        .post(`/api/leaves/${reqId}/decision`)
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          status: 'Rejected',
          decisionNotes: 'Critical exam invigilation scheduled on this day.',
        });

      expect(rejectRes.status).toBe(200);

      // Balances after rejection: pending released, used unchanged
      const afterBal = await request(app)
        .get('/api/leaves/balances')
        .set('Authorization', `Bearer ${asstCsToken}`);
      const sickAfter = afterBal.body.data.find((b: any) => b.leave_type_code === 'SICK');

      expect(sickAfter.pending_days).toBe(pendingMid - 1);
      expect(sickAfter.used_days).toBe(usedMid);
    });

    it('Cancellation of Pending request releases reservation', async () => {
      const submitRes = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${asstCsToken}`)
        .send({
          leaveTypeId: sickLeaveTypeId,
          startDate: '2026-12-03',
          endDate: '2026-12-03',
          isHalfDay: false,
          reason: 'Dentist appointment',
        });
      const reqId = submitRes.body.data.id;

      const cancelRes = await request(app)
        .post(`/api/leaves/${reqId}/cancel`)
        .set('Authorization', `Bearer ${asstCsToken}`)
        .send({ notes: 'Rescheduled dental checkup to next month' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('Cancelled');
    });

    it('Another user cannot cancel someone else leave request (403)', async () => {
      const submitRes = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${asstCsToken}`)
        .send({
          leaveTypeId: sickLeaveTypeId,
          startDate: '2026-12-07',
          endDate: '2026-12-07',
          isHalfDay: false,
          reason: 'Routine checkup',
        });
      const reqId = submitRes.body.data.id;

      const crossCancelRes = await request(app)
        .post(`/api/leaves/${reqId}/cancel`)
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({ notes: 'Attempting to cancel peer request' });

      expect(crossCancelRes.status).toBe(403);
    });
  });

  describe('6. Concurrency & Race Condition Safeguards', () => {
    it('Concurrent requests cannot overspend the same balance', async () => {
      // Ensure Lead Asst Prof CS has exactly 15.0 available Earned leave days before test
      await pool.query(
        'UPDATE leave_balances SET entitled_days = 15.0, used_days = 0.0, pending_days = 0.0 WHERE user_id = ? AND leave_type_id = ?',
        [asstLeadCsUserId, earnedLeaveTypeId]
      );

      // Submit two requests simultaneously where each requests 10 days (total 20 > 15),
      // so exactly one can succeed and the other must fail with insufficient balance
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/leaves')
          .set('Authorization', `Bearer ${asstLeadCsToken}`)
          .send({
            leaveTypeId: earnedLeaveTypeId,
            startDate: '2026-12-14',
            endDate: '2026-12-24', // 10 working days
            isHalfDay: false,
            reason: 'Concurrent booking thread A',
          }),
        request(app)
          .post('/api/leaves')
          .set('Authorization', `Bearer ${asstLeadCsToken}`)
          .send({
            leaveTypeId: earnedLeaveTypeId,
            startDate: '2027-01-04',
            endDate: '2027-01-14', // 10 working days
            isHalfDay: false,
            reason: 'Concurrent booking thread B',
          }),
      ]);

      // Total available is 15. Each requests 10 days (total 20 > 15). One must succeed (201) and one must fail (400)!
      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(201);
      expect(statuses).toContain(400);

      const failedRes = res1.status === 400 ? res1 : res2;
      expect(failedRes.body.error?.message || failedRes.body.message).toContain('Insufficient leave balance');
    });

    it('System Admin cannot submit departmental leave requests (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/leaves')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          leaveTypeId: casualLeaveTypeId,
          startDate: '2026-12-28',
          endDate: '2026-12-29',
          isHalfDay: false,
          reason: 'Admin personal day off',
        });

      expect(res.status).toBe(403);
      expect(res.body.error?.message || res.body.message).toMatch(/authorized to submit leave requests/i);
    });
  });
});
