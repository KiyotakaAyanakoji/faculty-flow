import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { seedDatabase } from '../src/db/seed.js';
import { pool } from '../src/config/database.js';

describe('Role-Based Access Control & Department Isolation Test Suite', () => {
  let adminToken: string;
  let hodCsToken: string;
  let profCsToken: string;
  let asstCsToken: string;
  let asstLeadCsToken: string;
  let hodMechToken: string;

  let csDeptId: number;
  let mechDeptId: number;
  let asstCsUserId: number;

  beforeAll(async () => {
    await seedDatabase();

    // Fetch department IDs
    const [depts] = await pool.query<any[]>('SELECT id, code FROM departments');
    csDeptId = depts.find((d: any) => d.code === 'CS').id;
    mechDeptId = depts.find((d: any) => d.code === 'MECH').id;

    // Fetch Assistant Professor ID
    const [users] = await pool.query<any[]>('SELECT id, email FROM users WHERE email = ?', [
      'asst.cs@facultyflow.local',
    ]);
    asstCsUserId = users[0].id;

    // Acquire tokens for test roles
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

    // Clean up any dynamic test artifacts
    await pool.query('DELETE FROM users WHERE email = ?', ['new.prof.cs@facultyflow.local']);
    await pool.query('DELETE FROM departments WHERE code = ?', ['EE']);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE email = ?', ['new.prof.cs@facultyflow.local']);
    await pool.query('DELETE FROM departments WHERE code = ?', ['EE']);
  });

  // --- SYSTEM ADMIN AUTHORIZATION ---
  it('System Admin: Can create departments', async () => {
    const res = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'EE',
        name: 'Electrical Engineering',
        description: 'Department of Electrical Engineering',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.department.code).toBe('EE');
  });

  it('Non-Admin: HOD and Professors cannot create departments (403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${hodCsToken}`)
      .send({
        code: 'CIVIL',
        name: 'Civil Engineering',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('System Admin: Can create user accounts and assign roles', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'new.prof.cs@facultyflow.local',
        password: 'Password@12345',
        fullName: 'Dr. John von Neumann',
        role: 'PROFESSOR',
        departmentId: csDeptId,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe('new.prof.cs@facultyflow.local');
    expect(res.body.user.role).toBe('PROFESSOR');
  });

  it('Non-Admin: HOD and Professors cannot create user accounts (403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${hodCsToken}`)
      .send({
        email: 'illegal.user@facultyflow.local',
        password: 'Password@12345',
        fullName: 'Hacker User',
        role: 'SYSTEM_ADMIN',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  // --- DEPARTMENT ISOLATION ---
  it('HOD: Can view faculty within their own department', async () => {
    const res = await request(app)
      .get(`/api/departments/${csDeptId}/faculty`)
      .set('Authorization', `Bearer ${hodCsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.faculty)).toBe(true);
  });

  it('HOD: Cannot view faculty from another department (403 Forbidden)', async () => {
    const res = await request(app)
      .get(`/api/departments/${mechDeptId}/faculty`)
      .set('Authorization', `Bearer ${hodCsToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CROSS_DEPARTMENT_FORBIDDEN');
  });

  it('Professor: Scoped to their own department in user listings', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${profCsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Every returned user must belong strictly to CS department
    for (const u of res.body.users) {
      expect(u.departmentId).toBe(csDeptId);
    }
  });

  // --- PRIVILEGE ESCALATION DEFENSE ---
  it('Privilege Escalation Defense: Non-admin self-update cannot modify role or department', async () => {
    const [me] = await pool.query<any[]>('SELECT id FROM users WHERE email = ?', [
      'prof.cs@facultyflow.local',
    ]);
    const profId = me[0].id;

    const res = await request(app)
      .patch(`/api/users/${profId}`)
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        fullName: 'Dr. Ada Lovelace Updated',
        role: 'SYSTEM_ADMIN', // Malicious attempt to escalate
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRIVILEGE_ESCALATION_DENIED');

    // Verify role in database remained unchanged
    const [check] = await pool.query<any[]>('SELECT role FROM users WHERE id = ?', [profId]);
    expect(check[0].role).toBe('PROFESSOR');
  });

  // --- TASK ALLOCATION MATRIX VERIFICATION ---
  it('HOD: Can allocate across all categories including Administrative', async () => {
    const categories = ['Teaching', 'Research', 'Grading', 'Meetings', 'Administrative'];

    for (const category of categories) {
      const res = await request(app)
        .post('/api/tasks/evaluate-allocation')
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          targetUserId: asstCsUserId,
          category,
        });

      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(true);
    }
  });

  it('Professor: Can allocate Teaching, Research, Grading, Meetings to departmental Assistant Professor', async () => {
    const allowedCategories = ['Teaching', 'Research', 'Grading', 'Meetings'];

    for (const category of allowedCategories) {
      const res = await request(app)
        .post('/api/tasks/evaluate-allocation')
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({
          targetUserId: asstCsUserId,
          category,
        });

      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(true);
    }
  });

  it('Professor: Cannot allocate Administrative work (Forbidden by matrix)', async () => {
    const res = await request(app)
      .post('/api/tasks/evaluate-allocation')
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        targetUserId: asstCsUserId,
        category: 'Administrative',
      });

    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.reason).toContain('not authorized to allocate');
  });

  it('Assistant Professor: Denied allocation by default (can_assign_work = false)', async () => {
    const res = await request(app)
      .post('/api/tasks/evaluate-allocation')
      .set('Authorization', `Bearer ${asstCsToken}`)
      .send({
        targetUserId: asstCsUserId,
        category: 'Teaching',
      });

    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.reason).toContain('denied by default');
  });

  it('Lead Assistant Professor: With can_assign_work=true, can allocate Teaching, Research, Grading', async () => {
    const permitted = ['Teaching', 'Research', 'Grading'];

    for (const category of permitted) {
      const res = await request(app)
        .post('/api/tasks/evaluate-allocation')
        .set('Authorization', `Bearer ${asstLeadCsToken}`)
        .send({
          targetUserId: asstCsUserId,
          category,
        });

      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(true);
    }

    // But Administrative and Meetings are prohibited
    const adminRes = await request(app)
      .post('/api/tasks/evaluate-allocation')
      .set('Authorization', `Bearer ${asstLeadCsToken}`)
      .send({
        targetUserId: asstCsUserId,
        category: 'Administrative',
      });

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.allowed).toBe(false);
  });

  it('Cross-department task allocation is prohibited', async () => {
    // MECH HOD trying to allocate work to CS Assistant Professor
    const res = await request(app)
      .post('/api/tasks/evaluate-allocation')
      .set('Authorization', `Bearer ${hodMechToken}`)
      .send({
        targetUserId: asstCsUserId,
        category: 'Teaching',
      });

    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.reason).toContain('Cross-department task allocation is strictly prohibited');
  });

  it('System Admin: Cannot allocate academic tasks', async () => {
    const res = await request(app)
      .post('/api/tasks/evaluate-allocation')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetUserId: asstCsUserId,
        category: 'Teaching',
      });

    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.reason).toContain('System Admin accounts manage infrastructure');
  });
});
