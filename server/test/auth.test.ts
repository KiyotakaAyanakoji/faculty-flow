import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { seedDatabase } from '../src/db/seed.js';
import { pool } from '../src/config/database.js';

describe('Authentication API Test Suite', () => {
  beforeAll(async () => {
    // Ensure test database is seeded with test fixtures
    await seedDatabase();
  });

  it('POST /api/auth/login - should successfully authenticate with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@facultyflow.local',
        password: 'Password@12345',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toHaveProperty('email', 'admin@facultyflow.local');
    expect(res.body.user).toHaveProperty('role', 'SYSTEM_ADMIN');
    
    // Security check: Ensure password hash is NEVER returned in the API response
    expect(res.body.user).not.toHaveProperty('password_hash');
    expect(res.body.user).not.toHaveProperty('password');
    expect(JSON.stringify(res.body)).not.toContain('password_hash');

    // Verify Set-Cookie header sets HttpOnly cookies
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c: string) => c.includes('accessToken') && c.includes('HttpOnly'))).toBe(true);
    expect(cookies.some((c: string) => c.includes('refreshToken') && c.includes('HttpOnly'))).toBe(true);
  });

  it('POST /api/auth/login - should reject invalid credentials with a generic error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@facultyflow.local',
        password: 'WrongPassword!999',
      });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.error.message).toBe('Invalid email or password.');
  });

  it('POST /api/auth/login - should reject non-existent email with the same generic error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@facultyflow.local',
        password: 'Password@12345',
      });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.error.message).toBe('Invalid email or password.');
  });

  it('POST /api/auth/login - should reject disabled/inactive accounts', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'inactive@facultyflow.local',
        password: 'Password@12345',
      });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.error.message).toContain('Account is inactive or disabled');
  });

  it('GET /api/auth/me - should reject unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.error.message).toContain('Authentication required');
  });

  it('GET /api/auth/me - should return authenticated user profile when token is provided', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'hod.cs@facultyflow.local',
        password: 'Password@12345',
      });

    const token = loginRes.body.accessToken;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.user).toHaveProperty('email', 'hod.cs@facultyflow.local');
    expect(meRes.body.user).toHaveProperty('role', 'HOD');
    expect(meRes.body.user).toHaveProperty('departmentCode', 'CS');
    expect(meRes.body.user).not.toHaveProperty('password_hash');
  });

  it('POST /api/auth/logout - should invalidate the refresh token in the database and clear cookies', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'prof.cs@facultyflow.local',
        password: 'Password@12345',
      });

    const refreshToken = loginRes.body.refreshToken;

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken });

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // Verify token reuse fails
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(401);
  });

  it('POST /api/auth/change-password - should require correct current password and update hash', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'prof.mech@facultyflow.local',
        password: 'Password@12345',
      });

    const token = loginRes.body.accessToken;

    // Wrong current password
    const wrongRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'WrongPassword!',
        newPassword: 'BrandNewPassword@2026',
      });

    expect(wrongRes.status).toBe(400);

    // Correct current password
    const changeRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'Password@12345',
        newPassword: 'BrandNewPassword@2026',
      });

    expect(changeRes.status).toBe(200);
    expect(changeRes.body.success).toBe(true);

    // Verify login with new password succeeds
    const newLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'prof.mech@facultyflow.local',
        password: 'BrandNewPassword@2026',
      });

    expect(newLoginRes.status).toBe(200);

    // Reset password back for other tests
    const resetToken = newLoginRes.body.accessToken;
    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${resetToken}`)
      .send({
        currentPassword: 'BrandNewPassword@2026',
        newPassword: 'Password@12345',
      });
  });
});
