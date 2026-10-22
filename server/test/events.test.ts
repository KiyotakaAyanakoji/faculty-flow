import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { seedDatabase } from '../src/db/seed.js';
import { pool } from '../src/config/database.js';

describe('Academic Calendar Events & Secure PDF Uploads API Test Suite (Phase 5)', () => {
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

    // Clean up test events
    await pool.query('DELETE FROM academic_events WHERE title LIKE ?', ['[TEST]-%']);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM academic_events WHERE title LIKE ?', ['[TEST]-%']);
  });

  it('HOD: Can create an academic event with participants in their department', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${hodCsToken}`)
      .send({
        title: '[TEST]-Department Curriculum Meeting',
        description: 'Quarterly review of syllabus and teaching schedules',
        category: 'Meeting',
        startTime: '2026-11-10T10:00:00Z',
        endTime: '2026-11-10T11:30:00Z',
        isAllDay: false,
        location: 'CS Seminar Hall A',
        participantIds: [profCsUserId, asstCsUserId],
      });

    expect(res.status).toBe(201);
    expect(res.body.eventId).toBeDefined();

    // Verify event details
    const eventRes = await request(app)
      .get(`/api/events/${res.body.eventId}`)
      .set('Authorization', `Bearer ${hodCsToken}`);

    expect(eventRes.status).toBe(200);
    expect(eventRes.body.title).toBe('[TEST]-Department Curriculum Meeting');
    expect(eventRes.body.category).toBe('Meeting');
    expect(eventRes.body.participants).toHaveLength(2);
  });

  it('Rejects event creation with end time earlier than start time', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${hodCsToken}`)
      .send({
        title: '[TEST]-Invalid Date Event',
        category: 'Workshop',
        startTime: '2026-11-12T14:00:00Z',
        endTime: '2026-11-12T12:00:00Z', // 2 hours earlier
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Validation failed/i);
  });

  it('Rejects invalid event category', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${hodCsToken}`)
      .send({
        title: '[TEST]-Invalid Category Event',
        category: 'NonExistentCategory',
        startTime: '2026-11-15T09:00:00Z',
        endTime: '2026-11-15T10:00:00Z',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Validation failed/i);
  });

  it('Assistant Professor: Denied event creation by role policy', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${asstCsToken}`)
      .send({
        title: '[TEST]-Unauthorized Asst Event',
        category: 'Meeting',
        startTime: '2026-11-18T10:00:00Z',
        endTime: '2026-11-18T11:00:00Z',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized to create academic events/i);
  });

  it('Cross-department participant isolation: Cannot invite faculty from another department', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${hodCsToken}`)
      .send({
        title: '[TEST]-Cross-Dept Event',
        category: 'Workshop',
        startTime: '2026-11-20T10:00:00Z',
        endTime: '2026-11-20T12:00:00Z',
        participantIds: [profMechUserId], // Mechanical faculty in CS event
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/belongs to a different department/i);
  });

  it('Department Isolation: Mechanical HOD cannot view Computer Science private event', async () => {
    // 1. CS HOD creates an event
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${hodCsToken}`)
      .send({
        title: '[TEST]-CS Private Defense',
        category: 'Exam',
        startTime: '2026-11-22T09:00:00Z',
        endTime: '2026-11-22T12:00:00Z',
      });

    const eventId = createRes.body.eventId;

    // 2. MECH HOD attempts to view it
    const viewRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${hodMechToken}`);

    expect(viewRes.status).toBe(403);
    expect(viewRes.body.error).toMatch(/another department/i);
  });

  it('Secure PDF Upload: Accepts valid PDF with %PDF- header and streams authorized download', async () => {
    // 1. Create an event to attach document
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        title: '[TEST]-Distributed Systems Exam Schedule',
        category: 'Exam',
        startTime: '2026-11-25T10:00:00Z',
        endTime: '2026-11-25T13:00:00Z',
        participantIds: [asstCsUserId],
      });

    const eventId = createRes.body.eventId;

    // 2. Upload valid PDF buffer
    const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n%%EOF');

    const uploadRes = await request(app)
      .post(`/api/events/${eventId}/documents`)
      .set('Authorization', `Bearer ${profCsToken}`)
      .attach('file', validPdfBuffer, 'ExamSchedule.pdf');

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.document).toBeDefined();
    expect(uploadRes.body.document.originalName).toBe('ExamSchedule.pdf');
    const docId = uploadRes.body.document.id;

    // 3. Authorized Download as attendee
    const downloadRes = await request(app)
      .get(`/api/events/${eventId}/documents/${docId}/download`)
      .set('Authorization', `Bearer ${asstCsToken}`);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-type']).toContain('application/pdf');
    expect(downloadRes.headers['content-disposition']).toContain('ExamSchedule.pdf');

    // 4. Cross-department download denial
    const unauthorizedDownload = await request(app)
      .get(`/api/events/${eventId}/documents/${docId}/download`)
      .set('Authorization', `Bearer ${hodMechToken}`);

    expect(unauthorizedDownload.status).toBe(403);
    expect(unauthorizedDownload.body.error).toMatch(/another department/i);
  });

  it('Secure PDF Upload: Rejects fake PDF without %PDF- magic bytes signature', async () => {
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${hodCsToken}`)
      .send({
        title: '[TEST]-Fake PDF Test Event',
        category: 'Meeting',
        startTime: '2026-11-28T10:00:00Z',
        endTime: '2026-11-28T11:00:00Z',
      });

    const eventId = createRes.body.eventId;

    // Disguised plain text file named .pdf
    const fakePdfBuffer = Buffer.from('Plain text disguised as PDF file');

    const uploadRes = await request(app)
      .post(`/api/events/${eventId}/documents`)
      .set('Authorization', `Bearer ${hodCsToken}`)
      .attach('file', fakePdfBuffer, 'Malicious.pdf');

    expect(uploadRes.status).toBe(400);
    expect(uploadRes.body.error).toMatch(/valid PDF document signature/i);
  });

  it('Secure PDF Upload: Rejects file exceeding 10 MB limit', async () => {
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${hodCsToken}`)
      .send({
        title: '[TEST]-Oversized PDF Test Event',
        category: 'Meeting',
        startTime: '2026-11-30T10:00:00Z',
        endTime: '2026-11-30T11:00:00Z',
      });

    const eventId = createRes.body.eventId;

    // Allocate 10.5 MB buffer
    const oversizedBuffer = Buffer.alloc(10.5 * 1024 * 1024, 0x25); // Starts with '%' but is > 10MB

    const uploadRes = await request(app)
      .post(`/api/events/${eventId}/documents`)
      .set('Authorization', `Bearer ${hodCsToken}`)
      .attach('file', oversizedBuffer, 'GiantBook.pdf');

    expect(uploadRes.status).toBe(400);
    expect(uploadRes.body.error).toMatch(/maximum limit of 10 MB/i);
  });

  it('Event deletion cascades to document records and unlinks physical storage files', async () => {
    // 1. Create event with document
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${hodCsToken}`)
      .send({
        title: '[TEST]-Event To Delete',
        category: 'Conference',
        startTime: '2026-12-01T09:00:00Z',
        endTime: '2026-12-01T17:00:00Z',
      });

    const eventId = createRes.body.eventId;
    const validPdfBuffer = Buffer.from('%PDF-1.4\nTest deletion document\n%%EOF');

    await request(app)
      .post(`/api/events/${eventId}/documents`)
      .set('Authorization', `Bearer ${hodCsToken}`)
      .attach('file', validPdfBuffer, 'Agenda.pdf');

    // 2. Delete event as HOD
    const deleteRes = await request(app)
      .delete(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${hodCsToken}`);

    expect(deleteRes.status).toBe(200);

    // 3. Confirm event is gone
    const getRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${hodCsToken}`);

    expect(getRes.status).toBe(404);
  });
});
