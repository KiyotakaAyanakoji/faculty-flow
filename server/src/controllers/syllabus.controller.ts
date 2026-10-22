import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { ROLES } from '../constants/roles.js';
import {
  createSyllabusSchema,
  updateSyllabusSchema,
  updateSyllabusProgressSchema,
  listSyllabusQuerySchema,
} from '../validators/syllabus.validators.js';
import { SyllabusRecord, SyllabusResponse, SyllabusUnit } from '../types/syllabus.types.js';
import { logAuditEvent } from '../services/audit.service.js';

export function formatSyllabusResponse(row: SyllabusRecord): SyllabusResponse {
  let unitsParsed: SyllabusUnit[] = [];
  if (row.units) {
    if (typeof row.units === 'string') {
      try {
        unitsParsed = JSON.parse(row.units);
      } catch {
        unitsParsed = [];
      }
    } else if (Array.isArray(row.units)) {
      unitsParsed = row.units;
    }
  }

  return {
    id: row.id,
    departmentId: row.department_id,
    courseCode: row.course_code,
    courseName: row.course_name,
    academicYear: row.academic_year,
    semester: row.semester,
    totalUnits: row.total_units,
    completedUnits: row.completed_units,
    completionPercentage: Number(row.completion_percentage),
    status: row.status,
    units: unitsParsed,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    department: {
      id: row.department_id,
      name: row.department_name || '',
      code: row.department_code || '',
    },
    faculty: row.faculty_id
      ? {
          id: row.faculty_id,
          fullName: row.faculty_name || '',
          email: row.faculty_email || '',
          role: row.faculty_role || '',
        }
      : null,
  };
}

const SYLLABUS_SELECT_QUERY = `
  SELECT 
    s.*,
    d.name AS department_name,
    d.code AS department_code,
    u.full_name AS faculty_name,
    u.email AS faculty_email,
    u.role AS faculty_role
  FROM syllabuses s
  JOIN departments d ON s.department_id = d.id
  LEFT JOIN users u ON s.faculty_id = u.id
`;

/**
 * POST /api/syllabus
 * Create a new course syllabus record
 */
export async function createSyllabus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    if (req.user.role === ROLES.SYSTEM_ADMIN || !req.user.departmentId) {
      return next(
        new AppError(
          'System Administrators manage infrastructure and cannot create course syllabuses.',
          403,
          'FORBIDDEN'
        )
      );
    }

    // Only HOD and Professors can create course syllabuses
    if (req.user.role !== ROLES.HOD && req.user.role !== ROLES.PROFESSOR) {
      return next(
        new AppError(
          'Only Heads of Department and Professors are authorized to create course syllabuses.',
          403,
          'INSUFFICIENT_PERMISSIONS'
        )
      );
    }

    const validated = createSyllabusSchema.parse(req.body);
    const departmentId = req.user.departmentId;

    // Validate faculty if assigned
    if (validated.facultyId) {
      const [facRows] = await pool.query<any[]>(
        'SELECT id, department_id, is_active FROM users WHERE id = ?',
        [validated.facultyId]
      );

      if (facRows.length === 0 || !facRows[0].is_active) {
        return next(new AppError('Assigned faculty member not found or inactive.', 404, 'FACULTY_NOT_FOUND'));
      }

      if (facRows[0].department_id !== departmentId) {
        return next(
          new AppError(
            'Assigned faculty member must belong to the same academic department.',
            403,
            'CROSS_DEPARTMENT_ASSIGNMENT_DENIED'
          )
        );
      }
    }

    // Default units structure if not provided
    const unitsData = validated.units || Array.from({ length: validated.totalUnits }, (_, i) => ({
      unitNumber: i + 1,
      title: `Unit ${i + 1}`,
      status: 'Pending',
    }));

    const [result] = await pool.query<any>(
      `INSERT INTO syllabuses (
        department_id, course_code, course_name, academic_year, semester,
        total_units, completed_units, completion_percentage, status, faculty_id, units
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0.00, 'Draft', ?, ?)`,
      [
        departmentId,
        validated.courseCode,
        validated.courseName,
        validated.academicYear,
        validated.semester,
        validated.totalUnits,
        validated.facultyId || null,
        JSON.stringify(unitsData),
      ]
    );

    const newId = result.insertId;
    const [createdRows] = await pool.query<any[]>(
      `${SYLLABUS_SELECT_QUERY} WHERE s.id = ?`,
      [newId]
    );

    await logAuditEvent({
      actorId: req.user.id,
      action: 'SYLLABUS_CREATED',
      targetType: 'SYLLABUS',
      targetId: newId,
      details: {
        courseCode: validated.courseCode,
        courseName: validated.courseName,
        departmentId,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      syllabus: formatSyllabusResponse(createdRows[0]),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/syllabus
 * List syllabus records for authorized department
 */
export async function listSyllabuses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    if (req.user.role === ROLES.SYSTEM_ADMIN || !req.user.departmentId) {
      res.status(200).json({
        success: true,
        syllabuses: [],
        pagination: { total: 0, page: 1, limit: 20, totalPages: 0 },
      });
      return;
    }

    const query = listSyllabusQuerySchema.parse(req.query);
    const departmentId = req.user.departmentId;

    let whereClause = ' WHERE s.department_id = ?';
    const params: any[] = [departmentId];

    if (query.status) {
      whereClause += ' AND s.status = ?';
      params.push(query.status);
    }

    if (query.facultyId) {
      whereClause += ' AND s.faculty_id = ?';
      params.push(query.facultyId);
    }

    if (query.search) {
      whereClause += ' AND (s.course_code LIKE ? OR s.course_name LIKE ?)';
      params.push(`%${query.search}%`, `%${query.search}%`);
    }

    // Count
    const [countRows] = await pool.query<any[]>(
      `SELECT COUNT(*) as total FROM syllabuses s ${whereClause}`,
      params
    );
    const total = Number(countRows[0].total);

    // Records
    const offset = (query.page - 1) * query.limit;
    const [rows] = await pool.query<any[]>(
      `${SYLLABUS_SELECT_QUERY} ${whereClause} ORDER BY s.course_code ASC LIMIT ? OFFSET ?`,
      [...params, query.limit, offset]
    );

    res.status(200).json({
      success: true,
      syllabuses: rows.map(formatSyllabusResponse),
      pagination: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/syllabus/:id
 * Retrieve single syllabus record
 */
export async function getSyllabusById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const syllabusId = Number(req.params.id);
    if (!syllabusId || isNaN(syllabusId)) {
      return next(new AppError('Invalid syllabus ID.', 400, 'INVALID_ID'));
    }

    const [rows] = await pool.query<any[]>(
      `${SYLLABUS_SELECT_QUERY} WHERE s.id = ?`,
      [syllabusId]
    );

    if (rows.length === 0) {
      return next(new AppError('Syllabus not found.', 404, 'NOT_FOUND'));
    }

    const syllabus = rows[0];

    // Department isolation
    if (req.user.role !== ROLES.SYSTEM_ADMIN && req.user.departmentId !== syllabus.department_id) {
      return next(
        new AppError(
          'Access denied. You cannot view syllabus records of another department.',
          403,
          'CROSS_DEPARTMENT_ACCESS_DENIED'
        )
      );
    }

    res.status(200).json({
      success: true,
      syllabus: formatSyllabusResponse(syllabus),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/syllabus/:id
 * Update syllabus course details or reassign faculty
 */
export async function updateSyllabus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const syllabusId = Number(req.params.id);
    const [rows] = await pool.query<any[]>('SELECT * FROM syllabuses WHERE id = ?', [syllabusId]);

    if (rows.length === 0) {
      return next(new AppError('Syllabus not found.', 404, 'NOT_FOUND'));
    }

    const existing = rows[0];

    // Isolation
    if (existing.department_id !== req.user.departmentId) {
      return next(new AppError('Access denied.', 403, 'FORBIDDEN'));
    }

    // Permission: HOD or currently assigned faculty
    const isHOD = req.user.role === ROLES.HOD;
    const isAssigned = existing.faculty_id === req.user.id;

    if (!isHOD && !isAssigned) {
      return next(new AppError('Only the HOD or assigned instructor can update this syllabus.', 403, 'FORBIDDEN'));
    }

    const validated = updateSyllabusSchema.parse(req.body);

    if (validated.facultyId !== undefined && validated.facultyId !== null) {
      if (!isHOD) {
        return next(new AppError('Only the HOD can reassign the course instructor.', 403, 'FORBIDDEN'));
      }

      const [facRows] = await pool.query<any[]>(
        'SELECT id, department_id, is_active FROM users WHERE id = ?',
        [validated.facultyId]
      );

      if (facRows.length === 0 || !facRows[0].is_active || facRows[0].department_id !== req.user.departmentId) {
        return next(new AppError('Invalid faculty member for this department.', 400, 'INVALID_FACULTY'));
      }
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (validated.courseName !== undefined) {
      updates.push('course_name = ?');
      params.push(validated.courseName);
    }
    if (validated.academicYear !== undefined) {
      updates.push('academic_year = ?');
      params.push(validated.academicYear);
    }
    if (validated.semester !== undefined) {
      updates.push('semester = ?');
      params.push(validated.semester);
    }
    if (validated.totalUnits !== undefined) {
      updates.push('total_units = ?');
      params.push(validated.totalUnits);
      // Recalculate percentage
      updates.push('completion_percentage = ROUND((completed_units / ?) * 100, 2)');
      params.push(validated.totalUnits);
    }
    if (validated.facultyId !== undefined) {
      updates.push('faculty_id = ?');
      params.push(validated.facultyId);
    }
    if (validated.status !== undefined) {
      updates.push('status = ?');
      params.push(validated.status);
    }

    if (updates.length > 0) {
      params.push(syllabusId);
      await pool.query(`UPDATE syllabuses SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    const [updatedRows] = await pool.query<any[]>(
      `${SYLLABUS_SELECT_QUERY} WHERE s.id = ?`,
      [syllabusId]
    );

    res.status(200).json({
      success: true,
      syllabus: formatSyllabusResponse(updatedRows[0]),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/syllabus/:id/progress
 * Update completed units & unit progress
 */
export async function updateSyllabusProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const syllabusId = Number(req.params.id);
    const [rows] = await pool.query<any[]>('SELECT * FROM syllabuses WHERE id = ?', [syllabusId]);

    if (rows.length === 0) {
      return next(new AppError('Syllabus not found.', 404, 'NOT_FOUND'));
    }

    const existing = rows[0];

    // Isolation check
    if (existing.department_id !== req.user.departmentId) {
      return next(new AppError('Access denied.', 403, 'FORBIDDEN'));
    }

    // Must be assigned faculty or HOD
    const isHOD = req.user.role === ROLES.HOD;
    const isAssigned = existing.faculty_id === req.user.id;

    if (!isHOD && !isAssigned) {
      return next(new AppError('Only the assigned instructor or HOD can update syllabus progress.', 403, 'FORBIDDEN'));
    }

    const validated = updateSyllabusProgressSchema.parse(req.body);

    if (validated.completedUnits > existing.total_units) {
      return next(
        new AppError(
          `Completed units (${validated.completedUnits}) cannot exceed total units (${existing.total_units}).`,
          400,
          'INVALID_COMPLETED_UNITS'
        )
      );
    }

    const completionPercentage = Number(((validated.completedUnits / existing.total_units) * 100).toFixed(2));
    let status = validated.status || existing.status;

    if (validated.completedUnits === existing.total_units) {
      status = 'Completed';
    } else if (validated.completedUnits > 0 && status === 'Draft') {
      status = 'In Progress';
    }

    const updates = [
      'completed_units = ?',
      'completion_percentage = ?',
      'status = ?',
    ];
    const params: any[] = [validated.completedUnits, completionPercentage, status];

    if (validated.units) {
      updates.push('units = ?');
      params.push(JSON.stringify(validated.units));
    }

    params.push(syllabusId);
    await pool.query(`UPDATE syllabuses SET ${updates.join(', ')} WHERE id = ?`, params);

    const [updatedRows] = await pool.query<any[]>(
      `${SYLLABUS_SELECT_QUERY} WHERE s.id = ?`,
      [syllabusId]
    );

    res.status(200).json({
      success: true,
      syllabus: formatSyllabusResponse(updatedRows[0]),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/syllabus/:id
 * Delete a syllabus record (HOD only)
 */
export async function deleteSyllabus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    if (req.user.role !== ROLES.HOD) {
      return next(new AppError('Only Heads of Department can delete syllabus records.', 403, 'FORBIDDEN'));
    }

    const syllabusId = Number(req.params.id);
    const [rows] = await pool.query<any[]>('SELECT * FROM syllabuses WHERE id = ?', [syllabusId]);

    if (rows.length === 0) {
      return next(new AppError('Syllabus not found.', 404, 'NOT_FOUND'));
    }

    if (rows[0].department_id !== req.user.departmentId) {
      return next(new AppError('Access denied.', 403, 'FORBIDDEN'));
    }

    await pool.query('DELETE FROM syllabuses WHERE id = ?', [syllabusId]);

    await logAuditEvent({
      actorId: req.user.id,
      action: 'SYLLABUS_DELETED',
      targetType: 'SYLLABUS',
      targetId: syllabusId,
      details: { courseCode: rows[0].course_code },
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: 'Syllabus record deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
}
