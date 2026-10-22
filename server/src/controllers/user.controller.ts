import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { ROLES } from '../constants/roles.js';
import { createUserSchema, updateUserSchema } from '../validators/auth.validators.js';
import { formatUserProfile } from './auth.controller.js';
import { logAuditEvent } from '../services/audit.service.js';

/**
 * GET /api/users
 * System Admin: Lists all users with optional filtering.
 * Departmental Faculty (HOD, Professor, Asst Prof): Scoped strictly to their own department.
 */
export async function listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const { role, departmentId } = req.query;

    let query = `
      SELECT u.*, d.name AS department_name, d.code AS department_code
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE 1=1
    `;
    const params: any[] = [];

    // Department isolation
    if (req.user.role !== ROLES.SYSTEM_ADMIN) {
      // Must be strictly scoped to their own department
      query += ' AND u.department_id = ?';
      params.push(req.user.departmentId);
    } else if (departmentId) {
      query += ' AND u.department_id = ?';
      params.push(Number(departmentId));
    }

    if (role && typeof role === 'string') {
      query += ' AND u.role = ?';
      params.push(role);
    }

    query += ' ORDER BY u.full_name ASC';

    const [rows] = await pool.query<any[]>(query, params);

    const users = rows.map(formatUserProfile);

    res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/users
 * System Admin only: Creates a new user with designated role and department.
 */
export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user || req.user.role !== ROLES.SYSTEM_ADMIN) {
      return next(new AppError('Forbidden: Only System Administrators can create accounts.', 403, 'FORBIDDEN_ROLE'));
    }

    const parseResult = createUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new AppError(parseResult.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    const { email, password, fullName, role, departmentId, canAssignWork } = parseResult.data;

    // Check unique email
    const [existing] = await pool.query<any[]>(
      'SELECT id FROM users WHERE LOWER(email) = LOWER(?)',
      [email]
    );

    if (existing.length > 0) {
      return next(new AppError('A user with this email address already exists.', 409, 'EMAIL_EXISTS'));
    }

    // Validate department exists if assigned
    if (departmentId) {
      const [deptRows] = await pool.query<any[]>(
        'SELECT id FROM departments WHERE id = ?',
        [departmentId]
      );
      if (deptRows.length === 0) {
        return next(new AppError('Referenced department does not exist.', 404, 'DEPARTMENT_NOT_FOUND'));
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await pool.query<any>(
      `INSERT INTO users (email, password_hash, full_name, role, department_id, can_assign_work, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [email, passwordHash, fullName, role, departmentId || null, canAssignWork ? 1 : 0]
    );

    const newUserId = result.insertId;

    await logAuditEvent({
      actorId: req.user.id,
      action: 'USER_CREATED',
      targetType: 'USER',
      targetId: newUserId,
      details: { email, role, departmentId },
      ipAddress: req.ip || req.socket.remoteAddress,
    });

    const [createdRows] = await pool.query<any[]>(
      `SELECT u.*, d.name AS department_name, d.code AS department_code
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = ?`,
      [newUserId]
    );

    res.status(201).json({
      success: true,
      message: 'User created successfully.',
      user: formatUserProfile(createdRows[0]),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/users/:id
 * Retrieve a specific user. Non-admins cannot access other departments.
 */
export async function getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const targetId = Number(req.params.id);
    if (isNaN(targetId)) {
      return next(new AppError('Invalid user ID specified.', 400, 'INVALID_USER_ID'));
    }

    const [rows] = await pool.query<any[]>(
      `SELECT u.*, d.name AS department_name, d.code AS department_code
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = ?`,
      [targetId]
    );

    if (rows.length === 0) {
      return next(new AppError('User not found.', 404, 'NOT_FOUND'));
    }

    const targetUser = rows[0];

    // Department boundary check
    if (
      req.user.role !== ROLES.SYSTEM_ADMIN &&
      req.user.id !== targetUser.id &&
      req.user.departmentId !== targetUser.department_id
    ) {
      return next(new AppError('Access to other departments is forbidden.', 403, 'CROSS_DEPARTMENT_FORBIDDEN'));
    }

    res.status(200).json({
      success: true,
      user: formatUserProfile(targetUser),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/users/:id
 * System Admin can update any field (role, dept, permissions, active).
 * Non-admin can only update self profile (full_name) and cannot escalate role or department.
 */
export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const targetId = Number(req.params.id);
    if (isNaN(targetId)) {
      return next(new AppError('Invalid user ID specified.', 400, 'INVALID_USER_ID'));
    }

    const parseResult = updateUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new AppError(parseResult.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    const isSystemAdmin = req.user.role === ROLES.SYSTEM_ADMIN;
    const isSelf = req.user.id === targetId;

    if (!isSystemAdmin && !isSelf) {
      return next(new AppError('Forbidden: Cannot modify other user accounts.', 403, 'FORBIDDEN'));
    }

    // Privilege escalation protection for non-admin
    if (!isSystemAdmin) {
      if (
        req.body.role !== undefined ||
        req.body.departmentId !== undefined ||
        req.body.canAssignWork !== undefined ||
        req.body.isActive !== undefined
      ) {
        return next(
          new AppError(
            'Unauthorized: Modifying role, department, or administrative privileges is restricted to System Administrators.',
            403,
            'PRIVILEGE_ESCALATION_DENIED'
          )
        );
      }
    }

    // Fetch existing user
    const [existingRows] = await pool.query<any[]>('SELECT * FROM users WHERE id = ?', [targetId]);
    if (existingRows.length === 0) {
      return next(new AppError('User not found.', 404, 'NOT_FOUND'));
    }

    const existingUser = existingRows[0];

    const updates: string[] = [];
    const params: any[] = [];

    if (parseResult.data.fullName !== undefined) {
      updates.push('full_name = ?');
      params.push(parseResult.data.fullName);
    }

    if (isSystemAdmin) {
      if (parseResult.data.role !== undefined) {
        updates.push('role = ?');
        params.push(parseResult.data.role);
      }
      if (parseResult.data.departmentId !== undefined) {
        // Validate department if set
        if (parseResult.data.departmentId !== null) {
          const [dept] = await pool.query<any[]>('SELECT id FROM departments WHERE id = ?', [
            parseResult.data.departmentId,
          ]);
          if (dept.length === 0) {
            return next(new AppError('Department does not exist.', 404, 'DEPARTMENT_NOT_FOUND'));
          }
        }
        updates.push('department_id = ?');
        params.push(parseResult.data.departmentId);
      }
      if (parseResult.data.canAssignWork !== undefined) {
        updates.push('can_assign_work = ?');
        params.push(parseResult.data.canAssignWork ? 1 : 0);
      }
      if (parseResult.data.isActive !== undefined) {
        updates.push('is_active = ?');
        params.push(parseResult.data.isActive ? 1 : 0);
      }
    }

    if (updates.length > 0) {
      params.push(targetId);
      await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

      await logAuditEvent({
        actorId: req.user.id,
        action: 'USER_UPDATED',
        targetType: 'USER',
        targetId,
        details: parseResult.data,
        ipAddress: req.ip || req.socket.remoteAddress,
      });
    }

    const [updatedRows] = await pool.query<any[]>(
      `SELECT u.*, d.name AS department_name, d.code AS department_code
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = ?`,
      [targetId]
    );

    res.status(200).json({
      success: true,
      message: 'User updated successfully.',
      user: formatUserProfile(updatedRows[0]),
    });
  } catch (error) {
    next(error);
  }
}
