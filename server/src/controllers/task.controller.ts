import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  canAllocateToTargetFaculty,
  ROLES,
  TaskCategory,
  ALL_TASK_CATEGORIES,
} from '../constants/roles.js';
import {
  createTaskSchema,
  updateTaskSchema,
  reassignTaskSchema,
  updateTaskStatusSchema,
  listTasksQuerySchema,
} from '../validators/task.validators.js';
import { TaskRecord, TaskResponse, TaskSummaryResponse } from '../types/task.types.js';
import { logAuditEvent } from '../services/audit.service.js';
import { enqueueNotification, NOTIFICATION_EVENTS } from '../services/email/index.js';

/**
 * Format a database task row into a clean TaskResponse
 */
export function formatTaskResponse(row: TaskRecord): TaskResponse {
  const formatDueDate = (d: string | Date): string => {
    if (d instanceof Date) {
      return d.toISOString().slice(0, 10);
    }
    const str = String(d);
    return str.length >= 10 ? str.slice(0, 10) : str;
  };

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    dueDate: formatDueDate(row.due_date),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    version: row.version !== undefined ? Number(row.version) : 1,
    creator: {
      id: row.creator_id,
      fullName: row.creator_name || 'Unknown',
      email: row.creator_email || '',
      role: row.creator_role || '',
    },
    assignee: {
      id: row.assignee_id,
      fullName: row.assignee_name || 'Unknown',
      email: row.assignee_email || '',
      role: row.assignee_role || '',
    },
    department: {
      id: row.department_id,
      name: row.department_name || '',
      code: row.department_code || '',
    },
  };
}

const TASK_SELECT_QUERY = `
  SELECT 
    t.*,
    c.full_name AS creator_name,
    c.email AS creator_email,
    c.role AS creator_role,
    a.full_name AS assignee_name,
    a.email AS assignee_email,
    a.role AS assignee_role,
    d.name AS department_name,
    d.code AS department_code
  FROM tasks t
  JOIN users c ON t.creator_id = c.id
  JOIN users a ON t.assignee_id = a.id
  JOIN departments d ON t.department_id = d.id
`;

/**
 * POST /api/tasks
 * Create and allocate a new task
 */
export async function createTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    // System Admins manage infrastructure, not departmental academic tasks
    if (req.user.role === ROLES.SYSTEM_ADMIN || !req.user.departmentId) {
      return next(
        new AppError(
          'System Admin accounts manage infrastructure and cannot allocate departmental tasks.',
          403,
          'SYSTEM_ADMIN_ALLOCATION_DENIED'
        )
      );
    }

    const parseResult = createTaskSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new AppError(parseResult.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    const { title, description, category, priority, dueDate, assigneeId } = parseResult.data;

    // Fetch target assignee from DB
    const [assigneeRows] = await pool.query<any[]>(
      'SELECT id, role, department_id, full_name, email, is_active FROM users WHERE id = ?',
      [assigneeId]
    );

    if (assigneeRows.length === 0) {
      return next(new AppError('Assignee not found.', 404, 'ASSIGNEE_NOT_FOUND'));
    }

    const assignee = assigneeRows[0];
    if (!assignee.is_active) {
      return next(new AppError('Cannot assign tasks to an inactive account.', 400, 'ASSIGNEE_INACTIVE'));
    }

    // Verify creator has allocation rights for target and category (if explicitly provided)
    const evaluation = canAllocateToTargetFaculty(
      {
        role: req.user.role,
        departmentId: req.user.departmentId,
        canAssignWork: req.user.canAssignWork,
      },
      {
        role: assignee.role,
        departmentId: assignee.department_id,
      },
      req.body.category ? (category as TaskCategory) : undefined
    );

    if (!evaluation.allowed) {
      return next(
        new AppError(
          evaluation.reason || 'You do not have permission to allocate this task.',
          403,
          'ALLOCATION_FORBIDDEN'
        )
      );
    }

    // Insert task into database within transaction
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query<any>(
        `INSERT INTO tasks (title, description, category, priority, status, due_date, creator_id, assignee_id, department_id, version)
         VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, ?, 1)`,
        [
          title,
          description || null,
          category,
          priority,
          dueDate,
          req.user.id,
          assignee.id,
          req.user.departmentId,
        ]
      );

      const taskId = result.insertId;

      await logAuditEvent({
        actorId: req.user.id,
        action: 'TASK_CREATED',
        targetType: 'TASK',
        targetId: taskId,
        details: { title, category, priority, assigneeId: assignee.id, dueDate },
        ipAddress: req.ip || req.socket.remoteAddress,
      });

      // Enqueue task assignment notification to the assignee
      const idempotencyHeader = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string | undefined;
      const idempotencyKey = idempotencyHeader
        ? `task-assigned-${taskId}-${idempotencyHeader}`
        : `task-assigned-${taskId}-${assignee.id}`;

      await enqueueNotification(
        {
          idempotencyKey,
          eventType: NOTIFICATION_EVENTS.TASK_ASSIGNED,
          recipientEmail: assignee.email,
          recipientName: assignee.full_name,
          recipientId: assignee.id,
          templateId: NOTIFICATION_EVENTS.TASK_ASSIGNED,
          payload: {
            title,
            category,
            priority,
            dueDate,
            creatorName: req.user.fullName || 'Academic Supervisor',
            description: description || 'No description provided',
          },
        },
        connection
      );

      await connection.commit();

      const [createdRows] = await pool.query<any[]>(
        `${TASK_SELECT_QUERY} WHERE t.id = ?`,
        [taskId]
      );

      res.status(201).json({
        success: true,
        message: 'Task created and allocated successfully.',
        task: formatTaskResponse(createdRows[0]),
      });
    } catch (txErr) {
      await connection.rollback();
      throw txErr;
    } finally {
      connection.release();
    }
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/tasks
 * List authorized tasks with filters and pagination
 */
export async function listTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    // System Admins do not have departmental tasks
    if (req.user.role === ROLES.SYSTEM_ADMIN || !req.user.departmentId) {
      res.status(200).json({
        success: true,
        count: 0,
        total: 0,
        page: 1,
        limit: 20,
        tasks: [],
      });
      return;
    }

    const queryResult = listTasksQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return next(new AppError(queryResult.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    const { page, limit, status, category, priority, assigneeId, view, search } = queryResult.data;
    const offset = (page - 1) * limit;

    let whereClause = ' WHERE t.department_id = ?';
    const params: any[] = [req.user.departmentId];

    // Role-based visibility
    if (view === 'assigned_to_me') {
      whereClause += ' AND t.assignee_id = ?';
      params.push(req.user.id);
    } else if (view === 'created_by_me') {
      whereClause += ' AND t.creator_id = ?';
      params.push(req.user.id);
    } else {
      // 'all' view: HOD can see all department tasks; Professors and Asst Profs see tasks they created or are assigned to
      if (req.user.role !== ROLES.HOD) {
        whereClause += ' AND (t.assignee_id = ? OR t.creator_id = ?)';
        params.push(req.user.id, req.user.id);
      }
    }

    if (status) {
      whereClause += ' AND t.status = ?';
      params.push(status);
    }

    if (category) {
      whereClause += ' AND t.category = ?';
      params.push(category);
    }

    if (priority) {
      whereClause += ' AND t.priority = ?';
      params.push(priority);
    }

    if (assigneeId) {
      whereClause += ' AND t.assignee_id = ?';
      params.push(assigneeId);
    }

    if (search) {
      whereClause += ' AND (t.title LIKE ? OR t.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Count query
    const [countRows] = await pool.query<any[]>(
      `SELECT COUNT(*) AS total FROM tasks t ${whereClause}`,
      params
    );
    const total = Number(countRows[0].total);

    // Data query with ordering: High priority tasks first, then by due date
    const [rows] = await pool.query<any[]>(
      `${TASK_SELECT_QUERY} ${whereClause} ORDER BY FIELD(t.priority, 'High', 'Medium', 'Low'), t.due_date ASC, t.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const tasks = rows.map(formatTaskResponse);

    res.status(200).json({
      success: true,
      count: tasks.length,
      total,
      page,
      limit,
      tasks,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/tasks/:id
 * View a single task
 */
export async function getTaskById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const taskId = Number(req.params.id);
    if (isNaN(taskId)) {
      return next(new AppError('Invalid task ID.', 400, 'INVALID_TASK_ID'));
    }

    const [rows] = await pool.query<any[]>(
      `${TASK_SELECT_QUERY} WHERE t.id = ?`,
      [taskId]
    );

    if (rows.length === 0) {
      return next(new AppError('Task not found.', 404, 'TASK_NOT_FOUND'));
    }

    const taskRow = rows[0];

    // Department boundary check
    if (req.user.role === ROLES.SYSTEM_ADMIN || taskRow.department_id !== req.user.departmentId) {
      return next(
        new AppError('Access to tasks from another department is forbidden.', 403, 'CROSS_DEPARTMENT_FORBIDDEN')
      );
    }

    // Scope check: HOD can view all; others must be creator or assignee
    if (
      req.user.role !== ROLES.HOD &&
      taskRow.creator_id !== req.user.id &&
      taskRow.assignee_id !== req.user.id
    ) {
      return next(new AppError('You do not have permission to view this task.', 403, 'TASK_ACCESS_DENIED'));
    }

    res.status(200).json({
      success: true,
      task: formatTaskResponse(taskRow),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/tasks/:id
 * Update task core details (title, description, priority, due date)
 */
export async function updateTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  const connection = await pool.getConnection();
  try {
    if (!req.user) {
      throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
    }

    const taskId = Number(req.params.id);
    if (isNaN(taskId)) {
      throw new AppError('Invalid task ID.', 400, 'INVALID_TASK_ID');
    }

    const parseResult = updateTaskSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new AppError(parseResult.error.errors[0].message, 400, 'VALIDATION_ERROR');
    }

    await connection.beginTransaction();

    const [rows] = await connection.query<any[]>('SELECT * FROM tasks WHERE id = ? FOR UPDATE', [taskId]);
    if (rows.length === 0) {
      throw new AppError('Task not found.', 404, 'TASK_NOT_FOUND');
    }

    const task = rows[0];

    // Department check
    if (req.user.role === ROLES.SYSTEM_ADMIN || task.department_id !== req.user.departmentId) {
      throw new AppError('Access to other departments is forbidden.', 403, 'CROSS_DEPARTMENT_FORBIDDEN');
    }

    // Permission check: only task creator or HOD can modify task details
    const isCreator = task.creator_id === req.user.id;
    const isHOD = req.user.role === ROLES.HOD;

    if (!isCreator && !isHOD) {
      throw new AppError('Only the task creator or HOD can modify task details.', 403, 'UNAUTHORIZED_TASK_MODIFICATION');
    }

    let hasChanges = false;
    const updates: string[] = [];
    const params: any[] = [];

    if (parseResult.data.title !== undefined && parseResult.data.title !== task.title) {
      updates.push('title = ?');
      params.push(parseResult.data.title);
      hasChanges = true;
    }

    if (parseResult.data.description !== undefined && parseResult.data.description !== task.description) {
      updates.push('description = ?');
      params.push(parseResult.data.description);
      hasChanges = true;
    }

    if (parseResult.data.priority !== undefined && parseResult.data.priority !== task.priority) {
      updates.push('priority = ?');
      params.push(parseResult.data.priority);
      hasChanges = true;
    }

    if (parseResult.data.dueDate !== undefined) {
      const currentDueDate = task.due_date instanceof Date
        ? task.due_date.toISOString().slice(0, 10)
        : String(task.due_date).slice(0, 10);
      if (parseResult.data.dueDate !== currentDueDate) {
        updates.push('due_date = ?');
        params.push(parseResult.data.dueDate);
        hasChanges = true;
      }
    }

    let newVersion = Number(task.version || 1);

    if (hasChanges && updates.length > 0) {
      updates.push('version = version + 1');
      params.push(taskId);
      await connection.query(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, params);
      newVersion += 1;

      await logAuditEvent({
        actorId: req.user.id,
        action: 'TASK_UPDATED',
        targetType: 'TASK',
        targetId: taskId,
        details: parseResult.data,
        ipAddress: req.ip || req.socket.remoteAddress,
      });

      // Notify assignee of updated task details
      const [assigneeUser] = await connection.query<any[]>(
        'SELECT email, full_name FROM users WHERE id = ?',
        [task.assignee_id]
      );
      if (assigneeUser.length > 0) {
        const idempotencyHeader = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string | undefined;
        const idempotencyKey = idempotencyHeader
          ? `task-updated-${taskId}-${idempotencyHeader}`
          : (newVersion === 2
              ? `task-updated-${taskId}-${task.assignee_id}`
              : `task-updated-${taskId}-${task.assignee_id}-v${newVersion}`);

        await enqueueNotification(
          {
            idempotencyKey,
            eventType: NOTIFICATION_EVENTS.TASK_UPDATED,
            recipientEmail: assigneeUser[0].email,
            recipientName: assigneeUser[0].full_name,
            recipientId: task.assignee_id,
            templateId: NOTIFICATION_EVENTS.TASK_UPDATED,
            payload: {
              title: parseResult.data.title || task.title,
              updatedFields: updates.filter(u => !u.startsWith('version')).map(u => u.split(' =')[0]).join(', '),
              updatedBy: req.user.fullName,
            },
          },
          connection
        );
      }
    }

    await connection.commit();

    const [updated] = await pool.query<any[]>(`${TASK_SELECT_QUERY} WHERE t.id = ?`, [taskId]);

    res.status(200).json({
      success: true,
      message: 'Task updated successfully.',
      task: formatTaskResponse(updated[0]),
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
}

/**
 * PATCH /api/tasks/:id/assign
 * Reassign an existing task to a new assignee
 */
export async function reassignTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  const connection = await pool.getConnection();
  try {
    if (!req.user) {
      throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
    }

    const taskId = Number(req.params.id);
    if (isNaN(taskId)) {
      throw new AppError('Invalid task ID.', 400, 'INVALID_TASK_ID');
    }

    const parseResult = reassignTaskSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new AppError(parseResult.error.errors[0].message, 400, 'VALIDATION_ERROR');
    }

    const { assigneeId } = parseResult.data;

    await connection.beginTransaction();

    const [rows] = await connection.query<any[]>('SELECT * FROM tasks WHERE id = ? FOR UPDATE', [taskId]);
    if (rows.length === 0) {
      throw new AppError('Task not found.', 404, 'TASK_NOT_FOUND');
    }

    const task = rows[0];

    // Department boundary
    if (req.user.role === ROLES.SYSTEM_ADMIN || task.department_id !== req.user.departmentId) {
      throw new AppError('Access to other departments is forbidden.', 403, 'CROSS_DEPARTMENT_FORBIDDEN');
    }

    // Only creator or departmental HOD can reassign
    if (task.creator_id !== req.user.id && req.user.role !== ROLES.HOD) {
      throw new AppError('Only the task creator or HOD can reassign this task.', 403, 'REASSIGN_FORBIDDEN');
    }

    // Fetch new assignee
    const [targetRows] = await connection.query<any[]>(
      'SELECT id, role, department_id, full_name, email, is_active FROM users WHERE id = ?',
      [assigneeId]
    );

    if (targetRows.length === 0) {
      throw new AppError('New assignee not found.', 404, 'ASSIGNEE_NOT_FOUND');
    }

    const newAssignee = targetRows[0];
    if (!newAssignee.is_active) {
      throw new AppError('Cannot assign tasks to an inactive account.', 400, 'ASSIGNEE_INACTIVE');
    }

    // Validate that the actor can allocate work to the new assignee
    const evaluation = canAllocateToTargetFaculty(
      {
        role: req.user.role,
        departmentId: req.user.departmentId,
        canAssignWork: req.user.canAssignWork,
      },
      {
        role: newAssignee.role,
        departmentId: newAssignee.department_id,
      }
    );

    if (!evaluation.allowed) {
      throw new AppError(
        evaluation.reason || 'You do not have permission to assign to this faculty member.',
        403,
        'REASSIGN_FORBIDDEN'
      );
    }

    let newVersion = Number(task.version || 1);
    const isDifferentAssignee = task.assignee_id !== assigneeId;

    if (isDifferentAssignee) {
      newVersion += 1;
      await connection.query('UPDATE tasks SET assignee_id = ?, version = version + 1 WHERE id = ?', [
        assigneeId,
        taskId,
      ]);

      await logAuditEvent({
        actorId: req.user.id,
        action: 'TASK_REASSIGNED',
        targetType: 'TASK',
        targetId: taskId,
        details: { previousAssigneeId: task.assignee_id, newAssigneeId: assigneeId },
        ipAddress: req.ip || req.socket.remoteAddress,
      });

      // Enqueue task reassignment notification to new assignee
      const idempotencyHeader = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string | undefined;
      const idempotencyKey = idempotencyHeader
        ? `task-reassigned-${taskId}-${idempotencyHeader}`
        : `task-reassigned-${taskId}-${newAssignee.id}`;

      await enqueueNotification(
        {
          idempotencyKey,
          eventType: NOTIFICATION_EVENTS.TASK_REASSIGNED,
          recipientEmail: newAssignee.email,
          recipientName: newAssignee.full_name,
          recipientId: newAssignee.id,
          templateId: NOTIFICATION_EVENTS.TASK_REASSIGNED,
          payload: {
            title: task.title,
            reassignedBy: req.user.fullName,
            dueDate: task.due_date,
          },
        },
        connection
      );
    }

    await connection.commit();

    const [updated] = await pool.query<any[]>(`${TASK_SELECT_QUERY} WHERE t.id = ?`, [taskId]);

    res.status(200).json({
      success: true,
      message: 'Task reassigned successfully.',
      task: formatTaskResponse(updated[0]),
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
}

/**
 * PATCH /api/tasks/:id/status
 * Update task status (Pending -> In Progress -> Completed)
 */
export async function updateTaskStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const taskId = Number(req.params.id);
    if (isNaN(taskId)) {
      return next(new AppError('Invalid task ID.', 400, 'INVALID_TASK_ID'));
    }

    const parseResult = updateTaskStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new AppError(parseResult.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    const { status } = parseResult.data;

    const [rows] = await pool.query<any[]>('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (rows.length === 0) {
      return next(new AppError('Task not found.', 404, 'TASK_NOT_FOUND'));
    }

    const task = rows[0];

    // Department boundary
    if (req.user.role === ROLES.SYSTEM_ADMIN || task.department_id !== req.user.departmentId) {
      return next(new AppError('Access to other departments is forbidden.', 403, 'CROSS_DEPARTMENT_FORBIDDEN'));
    }

    // Authorization: Actor must be the assignee, creator, or HOD
    const isAssignee = task.assignee_id === req.user.id;
    const isCreator = task.creator_id === req.user.id;
    const isHOD = req.user.role === ROLES.HOD;

    // Only the assigned faculty member can complete their assigned task
    if (status === 'Completed' && !isAssignee) {
      return next(new AppError('Only the assigned faculty member can complete this task.', 403, 'COMPLETION_UNAUTHORIZED'));
    }

    if (!isAssignee && !isCreator && !isHOD) {
      return next(new AppError('You do not have permission to update this task status.', 403, 'STATUS_UPDATE_DENIED'));
    }

    // Determine completion timestamp
    let completedAtUpdate = '';
    if (status === 'Completed') {
      if (task.status !== 'Completed') {
        completedAtUpdate = ', completed_at = NOW()';
      }
    } else if (status !== 'Completed' && task.status === 'Completed') {
      completedAtUpdate = ', completed_at = NULL';
    }

    await pool.query(
      `UPDATE tasks SET status = ? ${completedAtUpdate} WHERE id = ?`,
      [status, taskId]
    );

    await logAuditEvent({
      actorId: req.user.id,
      action: 'TASK_STATUS_CHANGED',
      targetType: 'TASK',
      targetId: taskId,
      details: { previousStatus: task.status, newStatus: status },
      ipAddress: req.ip || req.socket.remoteAddress,
    });

    const [updated] = await pool.query<any[]>(`${TASK_SELECT_QUERY} WHERE t.id = ?`, [taskId]);

    res.status(200).json({
      success: true,
      message: `Task status updated to '${status}'.`,
      task: formatTaskResponse(updated[0]),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/tasks/:id
 * Delete a task (creator or HOD only)
 */
export async function deleteTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  const connection = await pool.getConnection();
  try {
    if (!req.user) {
      throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
    }

    const taskId = Number(req.params.id);
    if (isNaN(taskId)) {
      throw new AppError('Invalid task ID.', 400, 'INVALID_TASK_ID');
    }

    await connection.beginTransaction();

    const [rows] = await connection.query<any[]>('SELECT * FROM tasks WHERE id = ? FOR UPDATE', [taskId]);
    if (rows.length === 0) {
      throw new AppError('Task not found.', 404, 'TASK_NOT_FOUND');
    }

    const task = rows[0];

    // Department boundary
    if (req.user.role === ROLES.SYSTEM_ADMIN || task.department_id !== req.user.departmentId) {
      throw new AppError('Access to other departments is forbidden.', 403, 'CROSS_DEPARTMENT_FORBIDDEN');
    }

    // Permission: Only creator or HOD
    if (task.creator_id !== req.user.id && req.user.role !== ROLES.HOD) {
      throw new AppError('Only the task creator or HOD can delete this task.', 403, 'DELETE_FORBIDDEN');
    }

    await connection.query('DELETE FROM tasks WHERE id = ?', [taskId]);

    await logAuditEvent({
      actorId: req.user.id,
      action: 'TASK_DELETED',
      targetType: 'TASK',
      targetId: taskId,
      details: { title: task.title, category: task.category },
      ipAddress: req.ip || req.socket.remoteAddress,
    });

    // Notify assignee that task was cancelled/deleted
    const [assigneeUser] = await connection.query<any[]>(
      'SELECT email, full_name FROM users WHERE id = ?',
      [task.assignee_id]
    );
    if (assigneeUser.length > 0) {
      const idempotencyHeader = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string | undefined;
      const idempotencyKey = idempotencyHeader
        ? `task-cancelled-${taskId}-${idempotencyHeader}`
        : `task-cancelled-${taskId}-${task.assignee_id}`;

      await enqueueNotification(
        {
          idempotencyKey,
          eventType: NOTIFICATION_EVENTS.TASK_CANCELLED,
          recipientEmail: assigneeUser[0].email,
          recipientName: assigneeUser[0].full_name,
          recipientId: task.assignee_id,
          templateId: NOTIFICATION_EVENTS.TASK_CANCELLED,
          payload: {
            title: task.title,
            cancelledBy: req.user.fullName,
          },
        },
        connection
      );
    }

    await connection.commit();

    res.status(200).json({
      success: true,
      message: 'Task deleted successfully.',
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
}

/**
 * GET /api/tasks/summary
 * Workload metrics and counts for the authenticated user and department
 */
export async function getTaskSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const emptySummary: TaskSummaryResponse = {
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      overdue: 0,
      categoryBreakdown: {
        Teaching: 0,
        Research: 0,
        Grading: 0,
        Meetings: 0,
        Administrative: 0,
      },
    };

    if (req.user.role === ROLES.SYSTEM_ADMIN || !req.user.departmentId) {
      res.status(200).json({ success: true, summary: emptySummary });
      return;
    }

    // Role-based scope for metrics
    let whereClause = ' WHERE t.department_id = ?';
    const params: any[] = [req.user.departmentId];

    if (req.user.role !== ROLES.HOD) {
      // Professors and Assistant Professors see summary for tasks they are involved in
      whereClause += ' AND (t.assignee_id = ? OR t.creator_id = ?)';
      params.push(req.user.id, req.user.id);
    }

    const [rows] = await pool.query<any[]>(
      `SELECT 
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) AS inProgress,
         SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status != 'Completed' AND due_date < CURRENT_DATE() THEN 1 ELSE 0 END) AS overdue
       FROM tasks t
       ${whereClause}`,
      params
    );

    const [catRows] = await pool.query<any[]>(
      `SELECT category, COUNT(*) as count 
       FROM tasks t 
       ${whereClause} 
       GROUP BY category`,
      params
    );

    const categoryBreakdown: Record<TaskCategory, number> = {
      Teaching: 0,
      Research: 0,
      Grading: 0,
      Meetings: 0,
      Administrative: 0,
    };

    for (const r of catRows) {
      if (ALL_TASK_CATEGORIES.includes(r.category)) {
        categoryBreakdown[r.category as TaskCategory] = Number(r.count);
      }
    }

    const summary: TaskSummaryResponse = {
      total: Number(rows[0].total) || 0,
      pending: Number(rows[0].pending) || 0,
      inProgress: Number(rows[0].inProgress) || 0,
      completed: Number(rows[0].completed) || 0,
      overdue: Number(rows[0].overdue) || 0,
      categoryBreakdown,
    };

    res.status(200).json({
      success: true,
      summary,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/tasks/eligible-assignees
 * Returns real, active faculty members in the department that the actor is authorized to assign work to
 */
export async function getEligibleAssignees(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    if (req.user.role === ROLES.SYSTEM_ADMIN || !req.user.departmentId) {
      res.status(200).json({ success: true, assignees: [] });
      return;
    }

    const category = (req.query.category as TaskCategory) || undefined;

    // Fetch all active faculty in the department
    const [rows] = await pool.query<any[]>(
      `SELECT id, email, full_name, role, department_id, can_assign_work 
       FROM users 
       WHERE department_id = ? AND is_active = TRUE
       ORDER BY FIELD(role, 'HOD', 'PROFESSOR', 'ASSISTANT_PROFESSOR'), full_name ASC`,
      [req.user.departmentId]
    );

    // Filter using canAllocateToTargetFaculty based on role hierarchy and department rules
    const eligible = rows.filter(faculty => {
      const evaluation = canAllocateToTargetFaculty(
        {
          role: req.user!.role,
          departmentId: req.user!.departmentId,
          canAssignWork: req.user!.canAssignWork,
        },
        {
          role: faculty.role,
          departmentId: faculty.department_id,
        }
      );
      return evaluation.allowed;
    });

    res.status(200).json({
      success: true,
      assignees: eligible.map(u => ({
        id: u.id,
        fullName: u.full_name,
        email: u.email,
        role: u.role,
      })),
    });
  } catch (error) {
    next(error);
  }
}
