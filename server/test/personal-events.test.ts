import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { seedDatabase } from '../src/db/seed.js';
import { pool } from '../src/config/database.js';

describe('Private Personal Events API Test Suite (Batch 5)', () => {
  let profCsToken: string;
  let asstCsToken: string;
  let hodCsToken: string;
  let adminToken: string;

  let profCsUserId: number;
  let asstCsUserId: number;

  beforeAll(async () => {
    await seedDatabase();

    const [users] = await pool.query<any[]>('SELECT id, email FROM users');
    profCsUserId = users.find((u: any) => u.email === 'prof.cs@facultyflow.local').id;
    asstCsUserId = users.find((u: any) => u.email === 'asst.cs@facultyflow.local').id;

    async function getToken(email: string) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'Password@12345' });
      return res.body.accessToken;
    }

    profCsToken = await getToken('prof.cs@facultyflow.local');
    asstCsToken = await getToken('asst.cs@facultyflow.local');
    hodCsToken = await getToken('hod.cs@facultyflow.local');
    adminToken = await getToken('admin@facultyflow.local');

    // Clean test personal events
    await pool.query('DELETE FROM personal_events WHERE title LIKE ?', ['[TEST]-%']);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM personal_events WHERE title LIKE ?', ['[TEST]-%']);
  });

  it('Faculty member can create a personal event', async () => {
    const res = await request(app)
      .post('/api/personal-events')
      .set('Authorization', `Bearer ${asstCsToken}`)
      .send({
        title: '[TEST]-Prepare Lab 3 Instructions',
        description: 'Draft problem statement and test cases for concurrency lab',
        eventDate: '2026-11-12',
        startTime: '14:00',
        endTime: '16:00',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.event).toBeDefined();
    expect(res.body.event.title).toBe('[TEST]-Prepare Lab 3 Instructions');
    expect(res.body.event.userId).toBe(asstCsUserId);
    expect(res.body.event.isPersonal).toBe(true);
  });

  it('Enforces server-side user ownership ignoring spoofed userId in body', async () => {
    // Assistant attempts to create an event with profCsUserId in body
    const res = await request(app)
      .post('/api/personal-events')
      .set('Authorization', `Bearer ${asstCsToken}`)
      .send({
        title: '[TEST]-Spoofed Owner Event',
        userId: profCsUserId,
        eventDate: '2026-11-14',
        startTime: '10:00',
      });

    expect(res.status).toBe(201);
    // Server must assign it to the authenticated token user (asstCsUserId), NOT profCsUserId
    expect(res.body.event.userId).toBe(asstCsUserId);
    expect(res.body.event.userId).not.toBe(profCsUserId);
  });

  it('Validates required fields and chronological start/end time', async () => {
    // Missing title
    const res1 = await request(app)
      .post('/api/personal-events')
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        eventDate: '2026-11-15',
        startTime: '10:00',
      });
    expect(res1.status).toBe(400);
    expect(res1.body.error).toMatch(/Validation failed/i);

    // End time earlier than start time
    const res2 = await request(app)
      .post('/api/personal-events')
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        title: '[TEST]-Invalid Time Order',
        eventDate: '2026-11-15',
        startTime: '14:00',
        endTime: '11:00',
      });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toMatch(/Validation failed/i);
  });

  it('Faculty member can list their own personal events with date filters', async () => {
    // Create an event for Professor CS
    await request(app)
      .post('/api/personal-events')
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        title: '[TEST]-Review Ph.D. Synopsis',
        eventDate: '2026-11-20',
        startTime: '11:00',
        endTime: '12:30',
      });

    const res = await request(app)
      .get('/api/personal-events?startDate=2026-11-01&endDate=2026-11-30')
      .set('Authorization', `Bearer ${profCsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.events)).toBe(true);
    const myEvent = res.body.events.find((e: any) => e.title === '[TEST]-Review Ph.D. Synopsis');
    expect(myEvent).toBeDefined();
    expect(myEvent.userId).toBe(profCsUserId);
    expect(myEvent.eventDate).toBe('2026-11-20');
  });

  it('Strict Privacy: Another faculty member cannot list or view personal events', async () => {
    // 1. Assistant Professor creates a private personal event
    const createRes = await request(app)
      .post('/api/personal-events')
      .set('Authorization', `Bearer ${asstCsToken}`)
      .send({
        title: '[TEST]-Confidential Appraisal Prep',
        description: 'Draft personal performance review achievements',
        eventDate: '2026-11-25',
        startTime: '15:00',
      });

    const eventId = createRes.body.event.id;

    // 2. Professor CS attempts to list personal events - must NOT see Assistant CS event
    const listRes = await request(app)
      .get('/api/personal-events')
      .set('Authorization', `Bearer ${profCsToken}`);

    expect(listRes.status).toBe(200);
    const leakedEvent = listRes.body.events.find((e: any) => e.id === eventId);
    expect(leakedEvent).toBeUndefined();

    // 3. Professor CS attempts to access Assistant CS event by direct ID - 403 Forbidden
    const getRes = await request(app)
      .get(`/api/personal-events/${eventId}`)
      .set('Authorization', `Bearer ${profCsToken}`);

    expect(getRes.status).toBe(403);
    expect(getRes.body.error).toMatch(/Forbidden/i);
  });

  it('Strict Privacy: HOD and System Admin cannot view another user private event', async () => {
    const createRes = await request(app)
      .post('/api/personal-events')
      .set('Authorization', `Bearer ${asstCsToken}`)
      .send({
        title: '[TEST]-Private Medical Appointment',
        eventDate: '2026-11-28',
        startTime: '09:00',
      });

    const eventId = createRes.body.event.id;

    // HOD attempt
    const hodRes = await request(app)
      .get(`/api/personal-events/${eventId}`)
      .set('Authorization', `Bearer ${hodCsToken}`);
    expect(hodRes.status).toBe(403);

    // Admin attempt
    const adminRes = await request(app)
      .get(`/api/personal-events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(403);
  });

  it('Creator can edit their personal event', async () => {
    // 1. Create event
    const createRes = await request(app)
      .post('/api/personal-events')
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        title: '[TEST]-Draft Grant Proposal',
        eventDate: '2026-12-02',
        startTime: '10:00',
      });

    const eventId = createRes.body.event.id;

    // 2. Update event
    const updateRes = await request(app)
      .patch(`/api/personal-events/${eventId}`)
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        title: '[TEST]-Finalize Grant Proposal',
        description: 'Submit proposal to DST research portal',
        endTime: '13:00',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.event.title).toBe('[TEST]-Finalize Grant Proposal');
    expect(updateRes.body.event.description).toBe('Submit proposal to DST research portal');
    expect(updateRes.body.event.endTime).toBe('13:00');
  });

  it('Another user cannot update or delete personal event', async () => {
    const createRes = await request(app)
      .post('/api/personal-events')
      .set('Authorization', `Bearer ${asstCsToken}`)
      .send({
        title: '[TEST]-Protected Event',
        eventDate: '2026-12-05',
        startTime: '10:00',
      });

    const eventId = createRes.body.event.id;

    // Prof attempts update
    const updateRes = await request(app)
      .patch(`/api/personal-events/${eventId}`)
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({ title: '[TEST]-Hacked Event' });
    expect(updateRes.status).toBe(403);

    // Prof attempts delete
    const deleteRes = await request(app)
      .delete(`/api/personal-events/${eventId}`)
      .set('Authorization', `Bearer ${profCsToken}`);
    expect(deleteRes.status).toBe(403);
  });

  it('Creator can delete their personal event', async () => {
    const createRes = await request(app)
      .post('/api/personal-events')
      .set('Authorization', `Bearer ${profCsToken}`)
      .send({
        title: '[TEST]-Event To Delete',
        eventDate: '2026-12-10',
        startTime: '16:00',
      });

    const eventId = createRes.body.event.id;

    const deleteRes = await request(app)
      .delete(`/api/personal-events/${eventId}`)
      .set('Authorization', `Bearer ${profCsToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // Confirm it is gone
    const getRes = await request(app)
      .get(`/api/personal-events/${eventId}`)
      .set('Authorization', `Bearer ${profCsToken}`);

    expect(getRes.status).toBe(404);
  });

  it('Personal events do not leak into shared events or holidays API', async () => {
    await request(app)
      .post('/api/personal-events')
      .set('Authorization', `Bearer ${asstCsToken}`)
      .send({
        title: '[TEST]-Super Secret Personal Event',
        eventDate: '2026-12-15',
        startTime: '11:00',
      });

    // Check /api/events (shared academic events)
    const eventsRes = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${asstCsToken}`);

    expect(eventsRes.status).toBe(200);
    const inEvents = eventsRes.body.events.find((e: any) => e.title.includes('Super Secret Personal Event'));
    expect(inEvents).toBeUndefined();

    // Check /api/holidays
    const holidaysRes = await request(app)
      .get('/api/holidays')
      .set('Authorization', `Bearer ${asstCsToken}`);

    expect(holidaysRes.status).toBe(200);
    const inHolidays = holidaysRes.body.holidays.find((h: any) => h.name.includes('Super Secret Personal Event'));
    expect(inHolidays).toBeUndefined();
  });
});
