import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { canAllocateToTargetFaculty, TaskCategory } from '../constants/roles.js';
import { checkAllocationSchema } from '../validators/auth.validators.js';

/**
 * POST /api/tasks/evaluate-allocation
 * Evaluates whether the authenticated actor is authorized to allocate a task of a given category to a target faculty member.
 */
export async function evaluateTaskAllocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const parseResult = checkAllocationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new AppError(parseResult.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    const { targetUserId, category } = parseResult.data;

    // Fetch target user
    const [targetRows] = await pool.query<any[]>(
      'SELECT id, role, department_id, full_name, is_active FROM users WHERE id = ?',
      [targetUserId]
    );

    if (targetRows.length === 0) {
      return next(new AppError('Target faculty member not found.', 404, 'NOT_FOUND'));
    }

    const target = targetRows[0];
    if (!target.is_active) {
      return next(new AppError('Target faculty member account is inactive.', 400, 'TARGET_INACTIVE'));
    }

    const evaluation = canAllocateToTargetFaculty(
      {
        role: req.user.role,
        departmentId: req.user.departmentId,
        canAssignWork: req.user.canAssignWork,
      },
      {
        role: target.role,
        departmentId: target.department_id,
      },
      category as TaskCategory
    );

    res.status(200).json({
      success: true,
      allowed: evaluation.allowed,
      ...(evaluation.reason && { reason: evaluation.reason }),
      context: {
        actor: {
          id: req.user.id,
          role: req.user.role,
          departmentId: req.user.departmentId,
          canAssignWork: req.user.canAssignWork,
        },
        target: {
          id: target.id,
          name: target.full_name,
          role: target.role,
          departmentId: target.department_id,
        },
        category,
      },
    });
  } catch (error) {
    next(error);
  }
}
