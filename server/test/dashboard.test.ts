import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { seedDatabase } from '../src/db/seed.js';
import { pool } from '../src/config/database.js';

describe('Role-Specific Dashboards & Workload API Test Suite (Phase 4)', () => {
  let adminToken: string;
  let hodCsToken: string;
  let profCsToken: string;
  let asstCsToken: string;
  let hodMechToken: string;

  let profCsUserId: number;
  let asstCsUserId: number;
  let csDeptId: number;

  beforeAll(async () => {
    await seedDatabase();

    const [depts] = await pool.query<any[]>('SELECT id, code FROM departments');
    csDeptId = depts.find((d: any) => d.code === 'CS').id;

    const [users] = await pool.query<any[]>('SELECT id, email FROM users');
    profCsUserId = users.find((u: any) => u.email === 'prof.cs@facultyflow.local').id;
    asstCsUserId = users.find((u: any) => u.email === 'asst.cs@facultyflow.local').id;

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

    // Create seed tasks with upcoming and overdue dates for workload testing
    await pool.query(
      `INSERT INTO tasks (title, description, category, priority, status, due_date, creator_id, assignee_id, department_id)
       VALUES 
         ('[DASHBOARD-TEST] Active Upcoming Task', 'Due in 3 days', 'Teaching', 'High', 'In Progress', DATE_ADD(CURRENT_DATE(), INTERVAL 3 DAY), ?, ?, ?),
         ('[DASHBOARD-TEST] Overdue Critical Task', 'Was due yesterday', 'Grading', 'High', 'Pending', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY), ?, ?, ?),
         ('[DASHBOARD-TEST] Completed Task', 'Done earlier', 'Research', 'Low', 'Completed', CURRENT_DATE(), ?, ?, ?)`,
      [
        profCsUserId, asstCsUserId, csDeptId,
        profCsUserId, asstCsUserId, csDeptId,
        profCsUserId, asstCsUserId, csDeptId,
      ]
    );

    // Create seed syllabus
    await pool.query(
      `INSERT INTO syllabuses (department_id, course_code, course_name, academic_year, semester, total_units, completed_units, completion_percentage, status, faculty_id)
       VALUES (?, '[DASHBOARD-TEST]-CS401', 'Distributed Systems', '2026-2027', 'Semester 7', 5, 2, 40.00, 'In Progress', ?)`,
      [csDeptId, profCsUserId]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM tasks WHERE title LIKE ?', ['[DASHBOARD-TEST] %']);
    await pool.query('DELETE FROM syllabuses WHERE course_code LIKE ?', ['[DASHBOARD-TEST]-%']);
  });

  it('System Admin: Receives infrastructure metrics and NO academic task data', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dashboard.role).toBe('SYSTEM_ADMIN');
    expect(res.body.dashboard.users).toBeDefined();
    expect(res.body.dashboard.users.total).toBeGreaterThan(0);
    expect(res.body.dashboard.users.byRole.SYSTEM_ADMIN).toBeGreaterThanOrEqual(1);
    expect(res.body.dashboard.departments.length).toBeGreaterThanOrEqual(2);
    expect(res.body.dashboard.recentAuditLogs).toBeDefined();

    // Verify academic task summaries are not present
    expect(res.body.dashboard.taskMetrics).toBeUndefined();
    expect(res.body.dashboard.facultyWorkload).toBeUndefined();
  });

  it('HOD: Receives department-wide workload, task metrics, and syllabus overview', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${hodCsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dashboard.role).toBe('HOD');
    expect(res.body.dashboard.department.code).toBe('CS');

    const metrics = res.body.dashboard.taskMetrics;
    expect(metrics.total).toBeGreaterThanOrEqual(3);
    expect(metrics.overdue).toBeGreaterThanOrEqual(1);
    expect(metrics.upcoming).toBeGreaterThanOrEqual(1);
    expect(metrics.completed).toBeGreaterThanOrEqual(1);
    expect(metrics.byPriority.High).toBeGreaterThanOrEqual(2);

    // Faculty workload distribution
    const workload = res.body.dashboard.facultyWorkload;
    expect(workload.length).toBeGreaterThan(0);
    const asstEntry = workload.find((f: any) => f.facultyId === asstCsUserId);
    expect(asstEntry).toBeDefined();
    expect(asstEntry.totalTasks).toBeGreaterThanOrEqual(3);

    // Syllabus overview
    const syllabusOverview = res.body.dashboard.syllabusOverview;
    expect(syllabusOverview.totalCourses).toBeGreaterThanOrEqual(1);
    expect(syllabusOverview.inProgress).toBeGreaterThanOrEqual(1);
  });

  it('HOD Isolation: MECH HOD does not receive CS department task counts', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${hodMechToken}`);

    expect(res.status).toBe(200);
    expect(res.body.dashboard.role).toBe('HOD');
    expect(res.body.dashboard.department.code).toBe('MECH');

    // MECH department has no tasks created in test
    expect(res.body.dashboard.taskMetrics.total).toBe(0);
  });

  it('Professor: Receives personal workload metrics and assigned courses', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${profCsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.dashboard.role).toBe('PROFESSOR');
    expect(res.body.dashboard.createdTasks.total).toBeGreaterThanOrEqual(3);
    expect(res.body.dashboard.assignedSyllabuses.some((s: any) => s.courseCode === '[DASHBOARD-TEST]-CS401')).toBe(true);

    // Professor does not get the full faculty workload breakdown table
    expect(res.body.dashboard.facultyWorkload).toBeUndefined();
  });

  it('Assistant Professor: Receives assigned workload and upcoming deadlines', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${asstCsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.dashboard.role).toBe('ASSISTANT_PROFESSOR');
    expect(res.body.dashboard.assignedTasks.total).toBeGreaterThanOrEqual(3);
    expect(res.body.dashboard.assignedTasks.overdue).toBeGreaterThanOrEqual(1);
    expect(res.body.dashboard.upcomingDeadlines.length).toBeGreaterThan(0);

    // No department-wide metrics
    expect(res.body.dashboard.facultyWorkload).toBeUndefined();
    expect(res.body.dashboard.syllabusOverview).toBeUndefined();
  });
});
