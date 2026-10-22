import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { ROLES } from '../constants/roles.js';
import { createDepartmentSchema } from '../validators/auth.validators.js';
import { formatUserProfile } from './auth.controller.js';
import { logAuditEvent } from '../services/audit.service.js';

/**
 * GET /api/departments
 * Accessible to all authenticated users
 */
export async function listDepartments(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [rows] = await pool.query<any[]>(`
      SELECT d.*, COUNT(u.id) AS faculty_count
      FROM departments d
      LEFT JOIN users u ON u.department_id = d.id AND u.is_active = TRUE
      GROUP BY d.id
      ORDER BY d.name ASC
    `);

    res.status(200).json({
      success: true,
      departments: rows.map(r => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        facultyCount: Number(r.faculty_count),
        createdAt: new Date(r.created_at).toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/departments
 * System Admin only: creates a new department
 */
export async function createDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user || req.user.role !== ROLES.SYSTEM_ADMIN) {
      return next(new AppError('Forbidden: Only System Administrators can create departments.', 403, 'FORBIDDEN_ROLE'));
    }

    const parseResult = createDepartmentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new AppError(parseResult.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    const { code, name, description } = parseResult.data;

    // Check code or name collisions
    const [existing] = await pool.query<any[]>(
      'SELECT id, code, name FROM departments WHERE code = ? OR name = ?',
      [code, name]
    );

    if (existing.length > 0) {
      const match = existing[0];
      const conflictField = match.code === code ? 'Code' : 'Name';
      return next(new AppError(`A department with this ${conflictField} already exists.`, 409, 'DEPARTMENT_EXISTS'));
    }

    const [result] = await pool.query<any>(
      'INSERT INTO departments (code, name, description) VALUES (?, ?, ?)',
      [code, name, description || null]
    );

    const newDeptId = result.insertId;

    await logAuditEvent({
      actorId: req.user.id,
      action: 'DEPARTMENT_CREATED',
      targetType: 'DEPARTMENT',
      targetId: newDeptId,
      details: { code, name },
      ipAddress: req.ip || req.socket.remoteAddress,
    });

    const [created] = await pool.query<any[]>('SELECT * FROM departments WHERE id = ?', [newDeptId]);

    res.status(201).json({
      success: true,
      message: 'Department created successfully.',
      department: created[0],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/departments/:id
 */
export async function getDepartmentById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const deptId = Number(req.params.id);
    if (isNaN(deptId)) {
      return next(new AppError('Invalid department ID.', 400, 'INVALID_DEPARTMENT_ID'));
    }

    const [rows] = await pool.query<any[]>('SELECT * FROM departments WHERE id = ?', [deptId]);
    if (rows.length === 0) {
      return next(new AppError('Department not found.', 404, 'NOT_FOUND'));
    }

    res.status(200).json({
      success: true,
      department: rows[0],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/departments/:id/faculty
 * Scoped: System Admin or members of this department only
 */
export async function getDepartmentFaculty(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const deptId = Number(req.params.id);
    if (isNaN(deptId)) {
      return next(new AppError('Invalid department ID.', 400, 'INVALID_DEPARTMENT_ID'));
    }

    // Scoping check
    if (req.user.role !== ROLES.SYSTEM_ADMIN && req.user.departmentId !== deptId) {
      return next(new AppError('Access to other departments is forbidden.', 403, 'CROSS_DEPARTMENT_FORBIDDEN'));
    }

    const [rows] = await pool.query<any[]>(
      `SELECT u.*, d.name AS department_name, d.code AS department_code
       FROM users u
       JOIN departments d ON u.department_id = d.id
       WHERE u.department_id = ? AND u.is_active = TRUE
       ORDER BY FIELD(u.role, 'HOD', 'PROFESSOR', 'ASSISTANT_PROFESSOR'), u.full_name ASC`,
      [deptId]
    );

    res.status(200).json({
      success: true,
      departmentId: deptId,
      faculty: rows.map(formatUserProfile),
    });
  } catch (error) {
    next(error);
  }
}
