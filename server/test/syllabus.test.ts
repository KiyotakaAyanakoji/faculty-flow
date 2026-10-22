import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { seedDatabase } from '../src/db/seed.js';
import { pool } from '../src/config/database.js';

describe('Syllabus Management API Test Suite (Phase 4)', () => {
  let adminToken: string;
  let hodCsToken: string;
  let profCsToken: string;
  let asstCsToken: string;
  let hodMechToken: string;

  let profCsUserId: number;
  let asstCsUserId: number;
  let profMechUserId: number;

  beforeAll(async () => {
    await seedDatabase();

    const [users] = await pool.query<any[]>('SELECT id, email FROM users');
    profCsUserId = users.find((u: any) => u.email === 'prof.cs@facultyflow.local').id;
    asstCsUserId = users.find((u: any) => u.email === 'asst.cs@facultyflow.local').id;
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
    hodMechToken = await getToken('hod.mech@facultyflow.local');

    // Clean up any test syllabuses
    await pool.query('DELETE FROM syllabuses WHERE course_code LIKE ?', ['[TEST]-%']);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM syllabuses WHERE course_code LIKE ?', ['[TEST]-%']);
  });

  it('HOD: Can create course syllabus with assigned faculty', async () => {
    const res = await request(app)
      .post('/api/syllabus')
      .set('Authorization', `Bearer ${hodCsToken}`)
      .send({
        courseCode: '[TEST]-CS301',
        courseName: 'Operating Systems & Concurrency',
        academicYear: '2026-2027',
        semester: 'Semester 5',
        totalUnits: 5,
        facultyId: profCsUserId,
        units: [
          { unitNumber: 1, title: 'Introduction & Kernel Architecture', status: 'Completed' },
          { unitNumber: 2, title: 'Processes & Threads', status: 'In Progress' },
          { unitNumber: 3, title: 'Deadlocks & Semaphores', status: 'Pending' },
          { unitNumber: 4, title: 'Memory Management & Paging', status: 'Pending' },
          { unitNumber: 5, title: 'File Systems & Storage', status: 'Pending' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.syllabus.courseCode).toBe('[TEST]-CS301');
    expect(res.body.syllabus.faculty?.id).toBe(profCsUserId);
    expect(res.body.syllabus.totalUnits).toBe(5);
  });

  it('Professor: Can create a course syllabus in their own department', async () => {
    const res = await request(app)
      .post('/api/syllabus')
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        courseCode: '[TEST]-CS302',
        courseName: 'Database Management Systems',
        academicYear: '2026-2027',
        semester: 'Semester 5',
        totalUnits: 4,
        facultyId: profCsUserId,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.syllabus.courseCode).toBe('[TEST]-CS302');
  });

  it('Assistant Professor: Denied from creating course syllabuses by default', async () => {
    const res = await request(app)
      .post('/api/syllabus')
      .set('Authorization', `Bearer ${asstCsToken}`)
      .send({
        courseCode: '[TEST]-CS303',
        courseName: 'Computer Networks',
        academicYear: '2026-2027',
        semester: 'Semester 5',
        totalUnits: 5,
      });

    expect(res.status).toBe(403);
  });

  it('System Admin: Denied from creating academic course syllabuses', async () => {
    const res = await request(app)
      .post('/api/syllabus')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        courseCode: '[TEST]-CS304',
        courseName: 'Algorithms Design',
        academicYear: '2026-2027',
        semester: 'Semester 5',
      });

    expect(res.status).toBe(403);
  });

  it('Cross-department faculty assignment to syllabus is rejected', async () => {
    const res = await request(app)
      .post('/api/syllabus')
      .set('Authorization', `Bearer ${hodCsToken}`)
      .send({
        courseCode: '[TEST]-CS305',
        courseName: 'Compilers',
        academicYear: '2026-2027',
        semester: 'Semester 6',
        facultyId: profMechUserId, // Mechanical professor for CS course
      });

    expect(res.status).toBe(403);
    expect(res.body.error?.message).toMatch(/same academic department/i);
  });

  it('Listing and Viewing: Enforces department isolation', async () => {
    // List CS syllabuses as CS HOD
    const csRes = await request(app)
      .get('/api/syllabus')
      .set('Authorization', `Bearer ${hodCsToken}`);

    expect(csRes.status).toBe(200);
    expect(csRes.body.syllabuses.length).toBeGreaterThan(0);
    const testCourse = csRes.body.syllabuses.find((s: any) => s.courseCode === '[TEST]-CS301');
    expect(testCourse).toBeDefined();

    // MECH HOD cannot see CS test syllabus in their list
    const mechRes = await request(app)
      .get('/api/syllabus')
      .set('Authorization', `Bearer ${hodMechToken}`);

    expect(mechRes.status).toBe(200);
    const mechHasCs = mechRes.body.syllabuses.some((s: any) => s.courseCode === '[TEST]-CS301');
    expect(mechHasCs).toBe(false);

    // MECH HOD direct GET on CS syllabus ID is rejected (403)
    const directRes = await request(app)
      .get(`/api/syllabus/${testCourse.id}`)
      .set('Authorization', `Bearer ${hodMechToken}`);

    expect(directRes.status).toBe(403);
  });

  it('Progress Tracking: Assigned faculty can update completed units and recalculate percentage', async () => {
    const [rows] = await pool.query<any[]>(
      'SELECT id FROM syllabuses WHERE course_code = ?',
      ['[TEST]-CS301']
    );
    const syllabusId = rows[0].id;

    // Prof CS is the assigned instructor
    const res = await request(app)
      .patch(`/api/syllabus/${syllabusId}/progress`)
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        completedUnits: 3,
        status: 'In Progress',
      });

    expect(res.status).toBe(200);
    expect(res.body.syllabus.completedUnits).toBe(3);
    expect(res.body.syllabus.completionPercentage).toBe(60); // 3/5 = 60%
    expect(res.body.syllabus.status).toBe('In Progress');

    // Unassigned Assistant Professor cannot update progress
    const unauthorizedRes = await request(app)
      .patch(`/api/syllabus/${syllabusId}/progress`)
      .set('Authorization', `Bearer ${asstCsToken}`)
      .send({
        completedUnits: 4,
      });

    expect(unauthorizedRes.status).toBe(403);
  });

  it('Progress Tracking: Reject invalid completed units exceeding total units', async () => {
    const [rows] = await pool.query<any[]>(
      'SELECT id FROM syllabuses WHERE course_code = ?',
      ['[TEST]-CS301']
    );
    const syllabusId = rows[0].id;

    const res = await request(app)
      .patch(`/api/syllabus/${syllabusId}/progress`)
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        completedUnits: 10, // Total is 5
      });

    expect(res.status).toBe(400);
    expect(res.body.error?.message).toMatch(/cannot exceed total units/i);
  });

  it('Deletion: Only HOD can delete course syllabus', async () => {
    const [rows] = await pool.query<any[]>(
      'SELECT id FROM syllabuses WHERE course_code = ?',
      ['[TEST]-CS302']
    );
    const syllabusId = rows[0].id;

    // Professor cannot delete
    const profDelete = await request(app)
      .delete(`/api/syllabus/${syllabusId}`)
      .set('Authorization', `Bearer ${profCsToken}`);

    expect(profDelete.status).toBe(403);

    // HOD can delete
    const hodDelete = await request(app)
      .delete(`/api/syllabus/${syllabusId}`)
      .set('Authorization', `Bearer ${hodCsToken}`);

    expect(hodDelete.status).toBe(200);
    expect(hodDelete.body.success).toBe(true);
  });
});
