import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { ROLES } from '../constants/roles.js';
import {
  createHandoverSchema,
  updateHandoverStatusSchema,
  listHandoversQuerySchema,
} from '../validators/handover.validators.js';
import { HandoverRecord, HandoverResponse } from '../types/handover.types.js';
import { logAuditEvent } from '../services/audit.service.js';

export function formatHandoverResponse(row: HandoverRecord): HandoverResponse {
  const formatDueDate = (d: string | Date | null): string | null => {
    if (!d) return null;
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    const str = String(d);
    return str.length >= 10 ? str.slice(0, 10) : str;
  };

  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    responseNotes: row.response_notes || null,
    status: row.status,
    dueDate: formatDueDate(row.due_date),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    sender: {
      id: row.sender_id,
      fullName: row.sender_name || 'Unknown',
      email: row.sender_email || '',
      role: row.sender_role || '',
    },
    recipient: {
      id: row.recipient_id,
      fullName: row.recipient_name || 'Unknown',
      email: row.recipient_email || '',
      role: row.recipient_role || '',
    },
    department: {
      id: row.department_id,
      name: row.department_name || '',
      code: row.department_code || '',
    },
    task: row.task_id
      ? {
          id: row.task_id,
          title: row.task_title || '',
          status: row.task_status || '',
          category: row.task_category || '',
        }
      : null,
  };
}

const HANDOVER_SELECT_QUERY = `
  SELECT 
    h.*,
    s.full_name AS sender_name,
    s.email AS sender_email,
    s.role AS sender_role,
    r.full_name AS recipient_name,
    r.email AS recipient_email,
    r.role AS recipient_role,
    d.name AS department_name,
    d.code AS department_code,
    t.title AS task_title,
    t.status AS task_status,
    t.category AS task_category
  FROM handovers h
  JOIN users s ON h.sender_id = s.id
  JOIN users r ON h.recipient_id = r.id
  JOIN departments d ON h.department_id = d.id
  LEFT JOIN tasks t ON h.task_id = t.id
`;

/**
 * POST /api/handovers
 * Create a new faculty handover record
 */
export async function createHandover(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    if (req.user.role === ROLES.SYSTEM_ADMIN || !req.user.departmentId) {
      return next(
        new AppError(
          'System Administrators manage infrastructure and cannot initiate academic handovers.',
          403,
          'FORBIDDEN'
        )
      );
    }

    const validated = createHandoverSchema.parse(req.body);
    const senderId = req.user.id;
    const departmentId = req.user.departmentId;

    if (validated.recipientId === senderId) {
      return next(new AppError('You cannot create a handover to yourself.', 400, 'INVALID_RECIPIENT'));
    }

    // Verify recipient in same department and active
    const [recipRows] = await pool.query<any[]>(
      'SELECT id, department_id, is_active FROM users WHERE id = ?',
      [validated.recipientId]
    );

    if (recipRows.length === 0 || !recipRows[0].is_active) {
      return next(new AppError('Recipient faculty member not found or inactive.', 404, 'RECIPIENT_NOT_FOUND'));
    }

    if (recipRows[0].department_id !== departmentId) {
      return next(
        new AppError(
          'Handover recipient must belong to the same academic department.',
          403,
          'CROSS_DEPARTMENT_HANDOVER_DENIED'
        )
      );
    }

    // Verify task if attached
    if (validated.taskId) {
      const [taskRows] = await pool.query<any[]>(
        'SELECT id, department_id, creator_id, assignee_id FROM tasks WHERE id = ?',
        [validated.taskId]
      );

      if (taskRows.length === 0) {
        return next(new AppError('Referenced task not found.', 404, 'TASK_NOT_FOUND'));
      }

      const task = taskRows[0];
      if (task.department_id !== departmentId) {
        return next(
          new AppError(
            'Cannot link a task from a different academic department.',
            403,
            'CROSS_DEPARTMENT_TASK_DENIED'
          )
        );
      }

      // Sender must have standing on task
      const isHOD = req.user.role === ROLES.HOD;
      const isCreator = task.creator_id === senderId;
      const isAssignee = task.assignee_id === senderId;

      if (!isHOD && !isCreator && !isAssignee) {
        return next(
          new AppError(
            'You can only link handovers to tasks that you created or are assigned to.',
            403,
            'TASK_AUTHORITY_REQUIRED'
          )
        );
      }
    }

    const [result] = await pool.query<any>(
      `INSERT INTO handovers (
        sender_id, recipient_id, department_id, task_id, title, notes, status, due_date
      ) VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)`,
      [
        senderId,
        validated.recipientId,
        departmentId,
        validated.taskId || null,
        validated.title,
        validated.notes,
        validated.dueDate || null,
      ]
    );

    const newId = result.insertId;
    const [createdRows] = await pool.query<any[]>(
      `${HANDOVER_SELECT_QUERY} WHERE h.id = ?`,
      [newId]
    );

    await logAuditEvent({
      actorId: senderId,
      action: 'HANDOVER_CREATED',
      targetType: 'HANDOVER',
      targetId: newId,
      details: {
        recipientId: validated.recipientId,
        taskId: validated.taskId,
        departmentId,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      handover: formatHandoverResponse(createdRows[0]),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/handovers
 * List authorized handovers
 */
export async function listHandovers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    if (req.user.role === ROLES.SYSTEM_ADMIN || !req.user.departmentId) {
      res.status(200).json({
        success: true,
        handovers: [],
        pagination: { total: 0, page: 1, limit: 20, totalPages: 0 },
      });
      return;
    }

    const query = listHandoversQuerySchema.parse(req.query);
    const departmentId = req.user.departmentId;
    const isHOD = req.user.role === ROLES.HOD;

    let whereClause = ' WHERE h.department_id = ?';
    const params: any[] = [departmentId];

    if (query.type === 'sent') {
      whereClause += ' AND h.sender_id = ?';
      params.push(req.user.id);
    } else if (query.type === 'received') {
      whereClause += ' AND h.recipient_id = ?';
      params.push(req.user.id);
    } else if (query.type === 'department' && isHOD) {
      // HOD sees all departmental handovers
    } else {
      // Non-HOD sees only where they are sender or recipient
      if (!isHOD) {
        whereClause += ' AND (h.sender_id = ? OR h.recipient_id = ?)';
        params.push(req.user.id, req.user.id);
      }
    }

    if (query.status) {
      whereClause += ' AND h.status = ?';
      params.push(query.status);
    }

    if (query.search) {
      whereClause += ' AND (h.title LIKE ? OR h.notes LIKE ?)';
      params.push(`%${query.search}%`, `%${query.search}%`);
    }

    const [countRows] = await pool.query<any[]>(
      `SELECT COUNT(*) as total FROM handovers h ${whereClause}`,
      params
    );
    const total = Number(countRows[0].total);

    const offset = (query.page - 1) * query.limit;
    const [rows] = await pool.query<any[]>(
      `${HANDOVER_SELECT_QUERY} ${whereClause} ORDER BY h.created_at DESC LIMIT ? OFFSET ?`,
      [...params, query.limit, offset]
    );

    res.status(200).json({
      success: true,
      handovers: rows.map(formatHandoverResponse),
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
 * GET /api/handovers/:id
 * Retrieve single handover details
 */
export async function getHandoverById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const handoverId = Number(req.params.id);
    if (!handoverId || isNaN(handoverId)) {
      return next(new AppError('Invalid handover ID.', 400, 'INVALID_ID'));
    }

    const [rows] = await pool.query<any[]>(
      `${HANDOVER_SELECT_QUERY} WHERE h.id = ?`,
      [handoverId]
    );

    if (rows.length === 0) {
      return next(new AppError('Handover not found.', 404, 'NOT_FOUND'));
    }

    const handover = rows[0];

    // Department isolation
    if (handover.department_id !== req.user.departmentId) {
      return next(new AppError('Access denied.', 403, 'CROSS_DEPARTMENT_ACCESS_DENIED'));
    }

    // Privacy: only sender, recipient, or department HOD can view
    const isSender = handover.sender_id === req.user.id;
    const isRecipient = handover.recipient_id === req.user.id;
    const isHOD = req.user.role === ROLES.HOD;

    if (!isSender && !isRecipient && !isHOD) {
      return next(
        new AppError(
          'Access denied. You are not authorized to view this handover record.',
          403,
          'PRIVATE_HANDOVER_ACCESS_DENIED'
        )
      );
    }

    res.status(200).json({
      success: true,
      handover: formatHandoverResponse(handover),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/handovers/:id/status
 * Update handover status (Accept, Reject, Complete)
 */
export async function updateHandoverStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const handoverId = Number(req.params.id);
    const [rows] = await pool.query<any[]>('SELECT * FROM handovers WHERE id = ?', [handoverId]);

    if (rows.length === 0) {
      return next(new AppError('Handover not found.', 404, 'NOT_FOUND'));
    }

    const existing = rows[0];

    // Department isolation
    if (existing.department_id !== req.user.departmentId) {
      return next(new AppError('Access denied.', 403, 'FORBIDDEN'));
    }

    const validated = updateHandoverStatusSchema.parse(req.body);
    const isSender = existing.sender_id === req.user.id;
    const isRecipient = existing.recipient_id === req.user.id;
    const isHOD = req.user.role === ROLES.HOD;

    // Authorization per transition
    if (validated.status === 'Accepted' || validated.status === 'Rejected') {
      if (!isRecipient) {
        return next(
          new AppError(
            'Only the designated recipient can accept or reject this handover.',
            403,
            'RECIPIENT_ACTION_REQUIRED'
          )
        );
      }
    } else if (validated.status === 'Completed') {
      if (!isSender && !isRecipient && !isHOD) {
        return next(new AppError('Not authorized to complete this handover.', 403, 'FORBIDDEN'));
      }
    }

    const completedAtClause = validated.status === 'Completed' ? 'completed_at = CURRENT_TIMESTAMP,' : '';

    await pool.query(
      `UPDATE handovers 
       SET status = ?, 
           response_notes = COALESCE(?, response_notes),
           ${completedAtClause}
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [validated.status, validated.responseNotes || null, handoverId]
    );

    // If handover is accepted and has a linked task, if task is pending, update to In Progress
    if (validated.status === 'Accepted' && existing.task_id) {
      await pool.query(
        "UPDATE tasks SET status = 'In Progress', assignee_id = ? WHERE id = ? AND status = 'Pending'",
        [existing.recipient_id, existing.task_id]
      );
    }

    const [updatedRows] = await pool.query<any[]>(
      `${HANDOVER_SELECT_QUERY} WHERE h.id = ?`,
      [handoverId]
    );

    await logAuditEvent({
      actorId: req.user.id,
      action: 'HANDOVER_STATUS_UPDATED',
      targetType: 'HANDOVER',
      targetId: handoverId,
      details: {
        previousStatus: existing.status,
        newStatus: validated.status,
      },
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      handover: formatHandoverResponse(updatedRows[0]),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/handovers/:id
 * Delete a pending handover (Sender or HOD only)
 */
export async function deleteHandover(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const handoverId = Number(req.params.id);
    const [rows] = await pool.query<any[]>('SELECT * FROM handovers WHERE id = ?', [handoverId]);

    if (rows.length === 0) {
      return next(new AppError('Handover not found.', 404, 'NOT_FOUND'));
    }

    const existing = rows[0];

    if (existing.department_id !== req.user.departmentId) {
      return next(new AppError('Access denied.', 403, 'FORBIDDEN'));
    }

    const isSender = existing.sender_id === req.user.id;
    const isHOD = req.user.role === ROLES.HOD;

    if (!isSender && !isHOD) {
      return next(new AppError('Only the sender or HOD can cancel this handover.', 403, 'FORBIDDEN'));
    }

    await pool.query('DELETE FROM handovers WHERE id = ?', [handoverId]);

    res.status(200).json({
      success: true,
      message: 'Handover record deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
}
