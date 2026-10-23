import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';

interface RateLimitRecord {
  count: number;
  firstAttemptAt: number;
  blockedUntil?: number;
}

const loginAttempts = new Map<string, RateLimitRecord>();

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes lock

export function loginRateLimiter(req: Request, _res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
  const email = (req.body?.email || '').toLowerCase().trim();
  const key = `${ip}:${email}`;

  const now = Date.now();
  const record = loginAttempts.get(key);

  if (record) {
    if (record.blockedUntil && now < record.blockedUntil) {
      const waitMinutes = Math.ceil((record.blockedUntil - now) / 60000);
      return next(
        new AppError(
          `Too many failed login attempts. Account temporarily locked for ${waitMinutes} minute(s).`,
          429,
          'RATE_LIMIT_EXCEEDED'
        )
      );
    }

    // Reset window if expired
    if (now - record.firstAttemptAt > WINDOW_MS) {
      loginAttempts.delete(key);
    }
  }

  next();
}

export function recordFailedLogin(req: Request): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
  const email = (req.body?.email || '').toLowerCase().trim();
  const key = `${ip}:${email}`;

  const now = Date.now();
  const record = loginAttempts.get(key);

  if (!record || now - record.firstAttemptAt > WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttemptAt: now });
  } else {
    record.count += 1;
    if (record.count >= MAX_FAILED_ATTEMPTS) {
      record.blockedUntil = now + BLOCK_DURATION_MS;
      console.warn(`[Security Alert] Rate limit triggered for login target: ${key}`);
    }
  }
}

export function clearFailedLogin(req: Request): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
  const email = (req.body?.email || '').toLowerCase().trim();
  const key = `${ip}:${email}`;
  loginAttempts.delete(key);
}

const changePasswordAttempts = new Map<string, RateLimitRecord>();

export function changePasswordRateLimiter(req: Request, _res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
  const userId = req.user?.id || 'anon';
  const key = `${ip}:pwchange:${userId}`;

  const now = Date.now();
  const record = changePasswordAttempts.get(key);

  if (record) {
    if (record.blockedUntil && now < record.blockedUntil) {
      const waitMinutes = Math.ceil((record.blockedUntil - now) / 60000);
      return next(
        new AppError(
          `Too many failed password change attempts. Please wait ${waitMinutes} minute(s) before trying again.`,
          429,
          'RATE_LIMIT_EXCEEDED'
        )
      );
    }
    if (now - record.firstAttemptAt > WINDOW_MS) {
      changePasswordAttempts.delete(key);
    }
  }

  next();
}

export function recordFailedPasswordChange(req: Request): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
  const userId = req.user?.id || 'anon';
  const key = `${ip}:pwchange:${userId}`;

  const now = Date.now();
  const record = changePasswordAttempts.get(key);

  if (!record || now - record.firstAttemptAt > WINDOW_MS) {
    changePasswordAttempts.set(key, { count: 1, firstAttemptAt: now });
  } else {
    record.count += 1;
    if (record.count >= MAX_FAILED_ATTEMPTS) {
      record.blockedUntil = now + BLOCK_DURATION_MS;
      console.warn(`[Security Alert] Rate limit triggered for password change target: ${key}`);
    }
  }
}

export function clearFailedPasswordChange(req: Request): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
  const userId = req.user?.id || 'anon';
  const key = `${ip}:pwchange:${userId}`;
  changePasswordAttempts.delete(key);
}
