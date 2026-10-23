import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { seedDatabase } from '../src/db/seed.js';
import { pool } from '../src/config/database.js';

describe('Task Management & Assignment API Test Suite (Phase 3)', () => {
  let adminToken: string;
  let hodCsToken: string;
  let profCsToken: string;
  let asstCsToken: string;
  let asstLeadCsToken: string;
  let hodMechToken: string;

  let csDeptId: number;
  let mechDeptId: number;
  let asstCsUserId: number;
  let profCsUserId: number;
  let asstLeadCsUserId: number;
  let profMechUserId: number;

  beforeAll(async () => {
    await seedDatabase();

    // Fetch department IDs
    const [depts] = await pool.query<any[]>('SELECT id, code FROM departments');
    csDeptId = depts.find((d: any) => d.code === 'CS').id;
    mechDeptId = depts.find((d: any) => d.code === 'MECH').id;

    // Fetch user IDs
    const [users] = await pool.query<any[]>('SELECT id, email FROM users');
    asstCsUserId = users.find((u: any) => u.email === 'asst.cs@facultyflow.local').id;
    profCsUserId = users.find((u: any) => u.email === 'prof.cs@facultyflow.local').id;
    asstLeadCsUserId = users.find((u: any) => u.email === 'asst.lead.cs@facultyflow.local').id;
    profMechUserId = users.find((u: any) => u.email === 'prof.mech@facultyflow.local').id;

    // Login helpers
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

    // Clean up any test tasks created during earlier runs
    await pool.query('DELETE FROM tasks WHERE title LIKE ?', ['[TEST] %']);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM tasks WHERE title LIKE ?', ['[TEST] %']);
  });

  // 1. Authorized Task Creation
  it('HOD: Can create and allocate tasks across all 5 categories', async () => {
    const categories = ['Teaching', 'Research', 'Grading', 'Meetings', 'Administrative'] as const;

    for (const category of categories) {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${hodCsToken}`)
        .send({
          title: `[TEST] HOD Task - ${category}`,
          description: `Departmental workload for ${category}`,
          category,
          priority: 'High',
          dueDate: '2026-11-15',
          assigneeId: asstCsUserId,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.task.category).toBe(category);
      expect(res.body.task.status).toBe('Pending');
      expect(res.body.task.assignee.id).toBe(asstCsUserId);
      expect(res.body.task.department.id).toBe(csDeptId);
    }
  });

  it('Professor: Can allocate Teaching, Research, Grading, Meetings to Assistant Professor', async () => {
    const allowed = ['Teaching', 'Research', 'Grading', 'Meetings'] as const;

    for (const category of allowed) {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${profCsToken}`)
        .send({
          title: `[TEST] Prof Allocation - ${category}`,
          category,
          priority: 'Medium',
          dueDate: '2026-11-20',
          assigneeId: asstCsUserId,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.task.category).toBe(category);
    }
  });

  it('Professor: Administrative task allocation is DENIED (403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        title: '[TEST] Illegal Administrative Task',
        category: 'Administrative',
        priority: 'High',
        dueDate: '2026-11-20',
        assigneeId: asstCsUserId,
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ALLOCATION_FORBIDDEN');
    expect(res.body.error.message).toContain('not authorized to allocate');
  });

  it('Assistant Professor: Allocation is DENIED by default (can_assign_work = false)', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${asstCsToken}`)
      .send({
        title: '[TEST] Asst Prof Default Allocation',
        category: 'Teaching',
        dueDate: '2026-11-20',
        assigneeId: asstLeadCsUserId,
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ALLOCATION_FORBIDDEN');
    expect(res.body.error.message).toContain('denied by default');
  });

  it('Lead Assistant Professor (can_assign_work=true): Can allocate permitted categories to fellow Assistant Professor', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${asstLeadCsToken}`)
      .send({
        title: '[TEST] Authorized Asst Prof Delegation',
        category: 'Grading',
        dueDate: '2026-11-22',
        assigneeId: asstCsUserId,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // But Administrative allocation is denied
    const adminRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${asstLeadCsToken}`)
      .send({
        title: '[TEST] Asst Lead Administrative Attempt',
        category: 'Administrative',
        dueDate: '2026-11-22',
        assigneeId: asstCsUserId,
      });

    expect(adminRes.status).toBe(403);
    expect(adminRes.body.error.code).toBe('ALLOCATION_FORBIDDEN');
  });

  it('System Admin: Cannot allocate departmental academic tasks', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: '[TEST] Admin Task Attempt',
        category: 'Teaching',
        dueDate: '2026-11-25',
        assigneeId: asstCsUserId,
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SYSTEM_ADMIN_ALLOCATION_DENIED');
  });

  // 2. Validation & Security Checks
  it('Validation: Rejects missing required fields and invalid date formats', async () => {
    // Missing title
    const res1 = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${hodCsToken}`)
      .send({
        category: 'Teaching',
        dueDate: '2026-11-20',
        assigneeId: asstCsUserId,
      });
    expect(res1.status).toBe(400);

    // Invalid date string
    const res2 = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${hodCsToken}`)
      .send({
        title: '[TEST] Invalid Date Task',
        category: 'Teaching',
        dueDate: 'not-a-valid-date',
        assigneeId: asstCsUserId,
      });
    expect(res2.status).toBe(400);
    expect(res2.body.error.message).toContain('YYYY-MM-DD');
  });

  it('Security: Client-supplied creator or department IDs cannot override server context', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        title: '[TEST] Spoofed Creator Task',
        category: 'Teaching',
        dueDate: '2026-11-20',
        assigneeId: asstCsUserId,
        creatorId: 9999, // Attempted spoof
        departmentId: mechDeptId, // Attempted cross-dept spoof
      });

    expect(res.status).toBe(201);
    // Verified that server used authenticated actor and their true department
    expect(res.body.task.creator.id).toBe(profCsUserId);
    expect(res.body.task.department.id).toBe(csDeptId);
  });

  it('Cross-department assignment is strictly blocked', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        title: '[TEST] Cross Dept Allocation Attempt',
        category: 'Teaching',
        dueDate: '2026-11-20',
        assigneeId: profMechUserId, // MECH department faculty
      });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('Cross-department');
  });

  // 3. Listing, Filtering & Scoping
  it('Listing: HOD can list departmental tasks and filter by status', async () => {
    const res = await request(app)
      .get('/api/tasks?status=Pending')
      .set('Authorization', `Bearer ${hodCsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.tasks)).toBe(true);
    for (const t of res.body.tasks) {
      expect(t.status).toBe('Pending');
      expect(t.department.id).toBe(csDeptId);
    }
  });

  it('Cross-department access: Users cannot view tasks from another department', async () => {
    // 1. Create a task in MECH department
    const createRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${hodMechToken}`)
      .send({
        title: '[TEST] MECH Task Isolation Check',
        category: 'Teaching',
        dueDate: '2026-11-30',
        assigneeId: profMechUserId,
      });

    const mechTaskId = createRes.body.task.id;

    // 2. CS HOD attempts to view MECH task
    const viewRes = await request(app)
      .get(`/api/tasks/${mechTaskId}`)
      .set('Authorization', `Bearer ${hodCsToken}`);

    expect(viewRes.status).toBe(403);
    expect(viewRes.body.error.code).toBe('CROSS_DEPARTMENT_FORBIDDEN');
  });

  // 4. Status Transitions, Reassignment & Completion
  it('Status Transitions: Assignee can update status and complete task', async () => {
    // 1. Create task
    const createRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${hodCsToken}`)
      .send({
        title: '[TEST] Status Transition Lifecycle',
        category: 'Teaching',
        dueDate: '2026-11-25',
        assigneeId: asstCsUserId,
      });

    const taskId = createRes.body.task.id;

    // 2. Move to 'In Progress'
    const progressRes = await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${asstCsToken}`)
      .send({ status: 'In Progress' });

    expect(progressRes.status).toBe(200);
    expect(progressRes.body.task.status).toBe('In Progress');
    expect(progressRes.body.task.completedAt).toBeNull();

    // 3. Complete task
    const completeRes = await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${asstCsToken}`)
      .send({ status: 'Completed' });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.task.status).toBe('Completed');
    expect(completeRes.body.task.completedAt).not.toBeNull();

    // 4. Invalid status transition/value rejection
    const invalidRes = await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${asstCsToken}`)
      .send({ status: 'ArchivedBogus' });

    expect(invalidRes.status).toBe(400);
  });

  it('Reassignment: Task creator can reassign task to eligible faculty', async () => {
    // 1. Create task
    const createRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        title: '[TEST] Reassignment Task',
        category: 'Grading',
        dueDate: '2026-11-28',
        assigneeId: asstCsUserId,
      });

    const taskId = createRes.body.task.id;

    // 2. Reassign to another Assistant Professor
    const reassignRes = await request(app)
      .patch(`/api/tasks/${taskId}/assign`)
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({ assigneeId: asstLeadCsUserId });

    expect(reassignRes.status).toBe(200);
    expect(reassignRes.body.task.assignee.id).toBe(asstLeadCsUserId);

    // 3. Unauthorized reassignment attempt by non-creator/non-HOD
    const unauthRes = await request(app)
      .patch(`/api/tasks/${taskId}/assign`)
      .set('Authorization', `Bearer ${asstCsToken}`)
      .send({ assigneeId: asstCsUserId });

    expect(unauthRes.status).toBe(403);
  });

  // 5. Task Summary & Workload Metrics
  it('Summary: GET /api/tasks/summary returns workload counts and category breakdown', async () => {
    const res = await request(app)
      .get('/api/tasks/summary')
      .set('Authorization', `Bearer ${hodCsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summary).toHaveProperty('total');
    expect(res.body.summary).toHaveProperty('pending');
    expect(res.body.summary).toHaveProperty('inProgress');
    expect(res.body.summary).toHaveProperty('completed');
    expect(res.body.summary).toHaveProperty('categoryBreakdown');
    expect(res.body.summary.categoryBreakdown).toHaveProperty('Teaching');
  });

  // 6. Eligible Assignees
  it('Eligible Assignees: Returns authorized faculty members in the department', async () => {
    // Professor should receive eligible Assistant Professors
    const res = await request(app)
      .get('/api/tasks/eligible-assignees?category=Teaching')
      .set('Authorization', `Bearer ${profCsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.assignees)).toBe(true);
    expect(res.body.assignees.some((a: any) => a.id === asstCsUserId)).toBe(true);

    // Assistant Professor with can_assign_work=false should receive empty list
    const asstRes = await request(app)
      .get('/api/tasks/eligible-assignees?category=Teaching')
      .set('Authorization', `Bearer ${asstCsToken}`);

    expect(asstRes.status).toBe(200);
    expect(asstRes.body.assignees).toHaveLength(0);
  });

  it('Batch 1: Task creation does not require category and succeeds for authorized roles', async () => {
    // Professor creates task without category field in payload
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        title: '[TEST] Category-Free Task Allocation',
        description: 'Allocated purely based on role hierarchy and department boundary',
        priority: 'High',
        dueDate: '2026-12-01',
        assigneeId: asstCsUserId,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.task.title).toBe('[TEST] Category-Free Task Allocation');
    expect(res.body.task.status).toBe('Pending');
    expect(res.body.task.assignee.id).toBe(asstCsUserId);
    expect(res.body.task.category).toBe('Teaching'); // default for DB schema
  });

  it('Batch 1: GET /api/tasks/eligible-assignees returns candidates without category parameter', async () => {
    const res = await request(app)
      .get('/api/tasks/eligible-assignees')
      .set('Authorization', `Bearer ${profCsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.assignees.some((a: any) => a.id === asstCsUserId)).toBe(true);
  });
});

