import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { pool } from '../config/database.js';
import { JWTAccessPayload } from '../types/auth.types.js';

/**
 * Generates a signed JWT access token
 */
export function generateAccessToken(payload: JWTAccessPayload): string {
  // @ts-expect-error jsonwebtoken typing issue with expiresIn string
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

/**
 * Verifies a JWT access token
 */
export function verifyAccessToken(token: string): JWTAccessPayload {
  return jwt.verify(token, env.JWT_SECRET) as JWTAccessPayload;
}

/**
 * Generates a secure random refresh token and stores its SHA-256 hash in the database
 */
export async function createRefreshToken(
  userId: number,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  // Generate high-entropy raw token
  const rawToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashToken(rawToken);

  // Set expiration (default: 7 days)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, tokenHash, expiresAt, ipAddress || null, userAgent || null]
  );

  return rawToken;
}

/**
 * Verifies that a refresh token exists, matches hash, and is not expired or revoked
 */
export async function verifyAndConsumeRefreshToken(rawToken: string): Promise<number | null> {
  const tokenHash = hashToken(rawToken);

  const [rows] = await pool.query<any[]>(
    `SELECT id, user_id, expires_at, revoked_at 
     FROM refresh_tokens 
     WHERE token_hash = ?`,
    [tokenHash]
  );

  if (rows.length === 0) {
    return null;
  }

  const tokenRecord = rows[0];

  if (tokenRecord.revoked_at !== null) {
    // Potential token reuse / compromise attempt: revoke all tokens for this user
    console.warn(`[Security Alert] Attempted reuse of revoked refresh token for user ${tokenRecord.user_id}`);
    await revokeAllUserTokens(tokenRecord.user_id);
    return null;
  }

  if (new Date(tokenRecord.expires_at) < new Date()) {
    return null;
  }

  // Revoke the old token (rotation)
  await pool.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?',
    [tokenRecord.id]
  );

  return tokenRecord.user_id;
}

/**
 * Revokes a specific refresh token by raw value
 */
export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await pool.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ?',
    [tokenHash]
  );
}

/**
 * Revokes all refresh tokens for a user (e.g., on logout-all or password change)
 */
export async function revokeAllUserTokens(userId: number): Promise<void> {
  await pool.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
    [userId]
  );
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
