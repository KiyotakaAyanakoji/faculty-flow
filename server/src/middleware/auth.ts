import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';
import { verifyAccessToken } from '../services/token.service.js';
import { pool } from '../config/database.js';
import { Role, ROLES } from '../constants/roles.js';
import { UserRecord } from '../types/auth.types.js';

/**
 * Middleware: Verifies JWT authentication via Bearer token or HttpOnly cookie
 */
export async function authenticateToken(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token: string | undefined;

    // 1. Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      // 2. Check HttpOnly cookie
      token = req.cookies.accessToken;
    }

    if (!token) {
      return next(new AppError('Authentication required. Please sign in.', 401, 'UNAUTHORIZED'));
    }

    // 3. Verify JWT
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (jwtErr: any) {
      if (jwtErr.name === 'TokenExpiredError') {
        return next(new AppError('Session expired. Please sign in again.', 401, 'TOKEN_EXPIRED'));
      }
      return next(new AppError('Invalid authentication token.', 401, 'INVALID_TOKEN'));
    }

    // 4. Query current user from DB to check status and permissions
    const [rows] = await pool.query<any[]>(
      `SELECT id, email, full_name, role, department_id, can_assign_work, is_active 
       FROM users 
       WHERE id = ?`,
      [payload.userId]
    );

    if (rows.length === 0) {
      return next(new AppError('User account not found.', 401, 'ACCOUNT_NOT_FOUND'));
    }

    const user: UserRecord = rows[0];

    if (!user.is_active) {
      return next(
        new AppError('Account is inactive or disabled. Contact administrator.', 403, 'ACCOUNT_INACTIVE')
      );
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.department_id,
      canAssignWork: Boolean(user.can_assign_work),
      fullName: user.full_name,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware: Enforces that the authenticated user possesses one of the allowed roles
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Forbidden: Role '${req.user.role}' is not authorized to access this resource.`,
          403,
          'FORBIDDEN_ROLE'
        )
      );
    }

    next();
  };
}

/**
 * Middleware: Enforces that departmental operations are strictly scoped to the user's department
 */
export function requireDepartmentScope(paramKey = 'departmentId') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const targetDeptId = Number(req.params[paramKey] || req.body[paramKey]);

    if (isNaN(targetDeptId)) {
      return next(new AppError('Invalid department ID specified.', 400, 'INVALID_DEPARTMENT_ID'));
    }

    // System Admins can view department records, but non-admins are strictly isolated
    if (req.user.role === ROLES.SYSTEM_ADMIN) {
      return next();
    }

    if (req.user.departmentId !== targetDeptId) {
      return next(
        new AppError('Access to other departments is forbidden.', 403, 'CROSS_DEPARTMENT_FORBIDDEN')
      );
    }

    next();
  };
}
