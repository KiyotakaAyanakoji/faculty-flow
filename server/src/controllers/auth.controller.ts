import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  generateAccessToken,
  createRefreshToken,
  verifyAndConsumeRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
} from '../services/token.service.js';
import { logAuditEvent } from '../services/audit.service.js';
import { recordFailedLogin, clearFailedLogin, recordFailedPasswordChange, clearFailedPasswordChange } from '../middleware/rateLimiter.js';
import { loginSchema, changePasswordSchema } from '../validators/auth.validators.js';
import { UserProfile, UserRecord } from '../types/auth.types.js';

export function formatUserProfile(user: any): UserProfile {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    departmentId: user.department_id,
    departmentName: user.department_name || null,
    departmentCode: user.department_code || null,
    canAssignWork: Boolean(user.can_assign_work),
    isActive: Boolean(user.is_active),
    createdAt: user.created_at ? new Date(user.created_at).toISOString() : new Date().toISOString(),
    updatedAt: user.updated_at ? new Date(user.updated_at).toISOString() : new Date().toISOString(),
  };
}

/**
 * POST /api/auth/login
 */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new AppError(parseResult.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    const { email, password } = parseResult.data;

    // Retrieve user and department details
    const [rows] = await pool.query<any[]>(
      `SELECT u.*, d.name AS department_name, d.code AS department_code 
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.email = ?`,
      [email]
    );

    if (rows.length === 0) {
      recordFailedLogin(req);
      return next(new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS'));
    }

    const user: UserRecord = rows[0];

    // Verify password hash
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      recordFailedLogin(req);
      return next(new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS'));
    }

    // Check account active status
    if (!user.is_active) {
      return next(
        new AppError('Account is inactive or disabled. Contact administrator.', 403, 'ACCOUNT_INACTIVE')
      );
    }

    // Clear rate limit tracking on success
    clearFailedLogin(req);

    // Issue Tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.department_id,
    });

    const refreshToken = await createRefreshToken(
      user.id,
      req.ip || req.socket.remoteAddress,
      req.headers['user-agent']
    );

    // Set secure HttpOnly cookies
    const isProd = env.NODE_ENV === 'production';
    const sameSite = env.COOKIE_SAME_SITE;
    const secure = isProd || sameSite === 'none';

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: 15 * 60 * 1000, // 15 mins
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Audit log
    await logAuditEvent({
      actorId: user.id,
      action: 'USER_LOGIN',
      targetType: 'USER',
      targetId: user.id,
      ipAddress: req.ip || req.socket.remoteAddress,
    });

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      user: formatUserProfile(rows[0]),
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/logout
 */
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (rawToken) {
      await revokeRefreshToken(rawToken);
    }

    if (req.user) {
      await logAuditEvent({
        actorId: req.user.id,
        action: 'USER_LOGOUT',
        targetType: 'USER',
        targetId: req.user.id,
        ipAddress: req.ip || req.socket.remoteAddress,
      });
    }

    // Clear cookies with matching secure and sameSite attributes
    const isProd = env.NODE_ENV === 'production';
    const sameSite = env.COOKIE_SAME_SITE;
    const secure = isProd || sameSite === 'none';

    res.clearCookie('accessToken', { httpOnly: true, secure, sameSite });
    res.clearCookie('refreshToken', { path: '/api/auth', httpOnly: true, secure, sameSite });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/refresh
 */
export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!rawToken) {
      return next(new AppError('Refresh token required.', 401, 'MISSING_REFRESH_TOKEN'));
    }

    const userId = await verifyAndConsumeRefreshToken(rawToken);
    if (!userId) {
      return next(new AppError('Invalid or expired refresh token. Please sign in again.', 401, 'INVALID_REFRESH_TOKEN'));
    }

    const [rows] = await pool.query<any[]>(
      'SELECT id, email, role, department_id, is_active FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0 || !rows[0].is_active) {
      return next(new AppError('User account not found or inactive.', 401, 'ACCOUNT_INACTIVE'));
    }

    const user = rows[0];

    const newAccessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.department_id,
    });

    const newRefreshToken = await createRefreshToken(
      user.id,
      req.ip || req.socket.remoteAddress,
      req.headers['user-agent']
    );

    const isProd = env.NODE_ENV === 'production';
    const sameSite = env.COOKIE_SAME_SITE;
    const secure = isProd || sameSite === 'none';

    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/me
 */
export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const [rows] = await pool.query<any[]>(
      `SELECT u.*, d.name AS department_name, d.code AS department_code 
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = ?`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return next(new AppError('User profile not found.', 404, 'NOT_FOUND'));
    }

    res.status(200).json({
      success: true,
      user: formatUserProfile(rows[0]),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/change-password
 */
export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const parseResult = changePasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new AppError(parseResult.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    const { currentPassword, newPassword } = parseResult.data;

    const [rows] = await pool.query<any[]>(
      'SELECT password_hash FROM users WHERE id = ?',
      [req.user.id]
    );

    if (rows.length === 0) {
      return next(new AppError('User not found.', 404, 'NOT_FOUND'));
    }

    const isMatch = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!isMatch) {
      recordFailedPasswordChange(req);
      return next(new AppError('Current password does not match.', 400, 'INCORRECT_PASSWORD'));
    }

    clearFailedPasswordChange(req);

    // Hash new password with 12 salt rounds
    const newHash = await bcrypt.hash(newPassword, 12);

    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

    // Invalidate all existing sessions/refresh tokens for security
    await revokeAllUserTokens(req.user.id);

    await logAuditEvent({
      actorId: req.user.id,
      action: 'PASSWORD_CHANGED',
      targetType: 'USER',
      targetId: req.user.id,
      ipAddress: req.ip || req.socket.remoteAddress,
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. Please sign in with your new password.',
    });
  } catch (error) {
    next(error);
  }
}
