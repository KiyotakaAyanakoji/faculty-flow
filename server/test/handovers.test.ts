import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { seedDatabase } from '../src/db/seed.js';
import { pool } from '../src/config/database.js';

describe('Faculty Handovers API Test Suite (Phase 4)', () => {
  let adminToken: string;
  let hodCsToken: string;
  let profCsToken: string;
  let asstCsToken: string;
  let asstLeadCsToken: string;
  let hodMechToken: string;

  let profCsUserId: number;
  let asstCsUserId: number;
  let asstLeadCsUserId: number;
  let profMechUserId: number;
  let csDeptId: number;
  let testTaskId: number;

  beforeAll(async () => {
    await seedDatabase();

    const [depts] = await pool.query<any[]>('SELECT id, code FROM departments');
    csDeptId = depts.find((d: any) => d.code === 'CS').id;

    const [users] = await pool.query<any[]>('SELECT id, email FROM users');
    profCsUserId = users.find((u: any) => u.email === 'prof.cs@facultyflow.local').id;
    asstCsUserId = users.find((u: any) => u.email === 'asst.cs@facultyflow.local').id;
    asstLeadCsUserId = users.find((u: any) => u.email === 'asst.lead.cs@facultyflow.local').id;
    profMechUserId = users.find((u: any) => u.email === 'prof.mech@facultyflow.local').id;

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
    asstLeadCsToken = await getToken('asst.lead.cs@facultyflow.local');
    hodMechToken = await getToken('hod.mech@facultyflow.local');

    // Create a test task to link
    const [taskRes] = await pool.query<any>(
      `INSERT INTO tasks (title, description, category, priority, status, due_date, creator_id, assignee_id, department_id)
       VALUES ('[TEST] Linked Handover Task', 'Lab setup for semester', 'Teaching', 'High', 'Pending', '2026-11-30', ?, ?, ?)`,
      [profCsUserId, asstCsUserId, csDeptId]
    );
    testTaskId = taskRes.insertId;

    await pool.query('DELETE FROM handovers WHERE title LIKE ?', ['[TEST] %']);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM handovers WHERE title LIKE ?', ['[TEST] %']);
    await pool.query('DELETE FROM tasks WHERE id = ?', [testTaskId]);
  });

  it('Faculty: Can create handover to colleague in same department', async () => {
    const res = await request(app)
      .post('/api/handovers')
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        recipientId: asstCsUserId,
        taskId: testTaskId,
        title: '[TEST] Operating Systems Lab Session Handover',
        notes: 'Please cover Session 4 on process scheduling. Slides and test cases are ready.',
        dueDate: '2026-11-15',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.handover.title).toBe('[TEST] Operating Systems Lab Session Handover');
    expect(res.body.handover.sender.id).toBe(profCsUserId);
    expect(res.body.handover.recipient.id).toBe(asstCsUserId);
    expect(res.body.handover.task?.id).toBe(testTaskId);
    expect(res.body.handover.status).toBe('Pending');
  });

  it('Validation: Cannot create handover to oneself', async () => {
    const res = await request(app)
      .post('/api/handovers')
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        recipientId: profCsUserId,
        title: '[TEST] Self Handover Attempt',
        notes: 'Handing over to myself',
      });

    expect(res.status).toBe(400);
    expect(res.body.error?.message).toMatch(/cannot create a handover to yourself/i);
  });

  it('Cross-Department: Cannot create handover to faculty in another department', async () => {
    const res = await request(app)
      .post('/api/handovers')
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        recipientId: profMechUserId, // Mechanical Engineering Professor
        title: '[TEST] Cross Dept Handover',
        notes: 'Attempting cross department transfer',
      });

    expect(res.status).toBe(403);
    expect(res.body.error?.message).toMatch(/same academic department/i);
  });

  it('System Admin: Denied from creating academic handovers', async () => {
    const res = await request(app)
      .post('/api/handovers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        recipientId: asstCsUserId,
        title: '[TEST] Admin Handover Attempt',
        notes: 'Admin trying to create handover',
      });

    expect(res.status).toBe(403);
  });

  it('Status Transition: Recipient can accept handover and trigger task update', async () => {
    // Create handover from Asst Prof CS to Lead Asst Prof CS
    const createRes = await request(app)
      .post('/api/handovers')
      .set('Authorization', `Bearer ${asstCsToken}`)
      .send({
        recipientId: asstLeadCsUserId,
        title: '[TEST] Midterm Grading Handover',
        notes: 'Handing over grading rubrics for midterm exams',
      });

    expect(createRes.status).toBe(201);
    const handoverId = createRes.body.handover.id;

    // Non-recipient (Prof CS) cannot accept
    const unauthorizedAccept = await request(app)
      .patch(`/api/handovers/${handoverId}/status`)
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({ status: 'Accepted' });

    expect(unauthorizedAccept.status).toBe(403);

    // Designated recipient (Lead Asst Prof CS) accepts
    const acceptRes = await request(app)
      .patch(`/api/handovers/${handoverId}/status`)
      .set('Authorization', `Bearer ${asstLeadCsToken}`)
      .send({
        status: 'Accepted',
        responseNotes: 'Confirmed, will review and grade by Friday.',
      });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.handover.status).toBe('Accepted');
    expect(acceptRes.body.handover.responseNotes).toMatch(/Confirmed/);
  });

  it('Status Transition: Recipient can reject handover with explanatory response notes', async () => {
    const createRes = await request(app)
      .post('/api/handovers')
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        recipientId: asstCsUserId,
        title: '[TEST] Committee Duties Handover',
        notes: 'Please cover accreditation meeting next Tuesday.',
      });

    const handoverId = createRes.body.handover.id;

    const rejectRes = await request(app)
      .patch(`/api/handovers/${handoverId}/status`)
      .set('Authorization', `Bearer ${asstCsToken}`)
      .send({
        status: 'Rejected',
        responseNotes: 'Conflict with scheduled lab examination.',
      });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.handover.status).toBe('Rejected');
    expect(rejectRes.body.handover.responseNotes).toMatch(/Conflict/);
  });

  it('Privacy: Unrelated faculty cannot view private handovers', async () => {
    // Create private handover between Prof CS and Asst CS
    const createRes = await request(app)
      .post('/api/handovers')
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        recipientId: asstCsUserId,
        title: '[TEST] Confidential Research Task Handover',
        notes: 'Private grant application handover notes.',
      });

    const handoverId = createRes.body.handover.id;

    // Unrelated Assistant Professor (asstLeadCs) cannot view
    const viewDenied = await request(app)
      .get(`/api/handovers/${handoverId}`)
      .set('Authorization', `Bearer ${asstLeadCsToken}`);

    expect(viewDenied.status).toBe(403);

    // Department HOD CAN view for oversight
    const hodView = await request(app)
      .get(`/api/handovers/${handoverId}`)
      .set('Authorization', `Bearer ${hodCsToken}`);

    expect(hodView.status).toBe(200);
    expect(hodView.body.handover.title).toBe('[TEST] Confidential Research Task Handover');
  });
});
