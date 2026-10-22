import { Request, Response, NextFunction } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { ROLES } from '../constants/roles.js';
import {
  LEAVE_STATUSES,
  DEFAULT_ACADEMIC_YEAR,
} from '../constants/leave.js';
import {
  submitLeaveSchema,
  decideLeaveSchema,
  cancelLeaveSchema,
  leaveFilterSchema,
} from '../validators/leave.validators.js';
import {
  LeaveType,
  LeaveBalance,
  LeaveRequest,
} from '../types/leave.types.js';
import { logAuditEvent } from '../services/audit.service.js';
import { enqueueNotification, NOTIFICATION_EVENTS } from '../services/email/index.js';

/**
 * Calculate leave duration in days.
 * Excludes Sundays (standard Indian institutional working policy).
 * Half-day leave counts as 0.5 days.
 */
export function calculateLeaveDuration(
  startDateStr: string,
  endDateStr: string,
  isHalfDay?: boolean
): number {
  if (isHalfDay) {
    return 0.5;
  }

  const start = new Date(startDateStr + 'T00:00:00Z');
  const end = new Date(endDateStr + 'T00:00:00Z');

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return 0;
  }

  let workingDays = 0;
  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getUTCDay(); // 0 is Sunday
    if (dayOfWeek !== 0) {
      workingDays += 1;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return workingDays;
}

/**
 * Format DATE column from MySQL into YYYY-MM-DD string
 */
function formatDate(val: string | Date | null): string {
  if (!val) return '';
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  const str = String(val);
  return str.length >= 10 ? str.slice(0, 10) : str;
}

/**
 * GET /api/leaves/types
 * Retrieve all available leave types
 */
export async function getLeaveTypes(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const [types] = await pool.query<RowDataPacket[]>(
      `SELECT id, code, name, description, is_paid, 
              CAST(default_days_per_year AS DOUBLE) as default_days_per_year,
              requires_approval, allow_half_day, created_at, updated_at
       FROM leave_types
       ORDER BY id ASC`
    );

    res.json({
      success: true,
      data: types,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/leaves/calculate
 * Calculate leave days for a given date range
 */
export async function getLeaveCalculation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { startDate, endDate, isHalfDay } = req.query;

    if (!startDate || !endDate || typeof startDate !== 'string' || typeof endDate !== 'string') {
      throw new AppError('Both startDate and endDate query parameters are required in YYYY-MM-DD format.', 400);
    }

    const halfDay = isHalfDay === 'true' || isHalfDay === '1';
    const daysCount = calculateLeaveDuration(startDate, endDate, halfDay);

    res.json({
      success: true,
      data: {
        startDate,
        endDate,
        isHalfDay: halfDay,
        daysCount,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/leaves/balances
 * Retrieve authenticated user's leave balances for the given academic year
 */
export async function getMyLeaveBalances(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const academicYear = (req.query.academicYear as string) || DEFAULT_ACADEMIC_YEAR;

    const [balances] = await pool.query<RowDataPacket[]>(
      `SELECT 
         lt.id as leave_type_id,
         lt.code as leave_type_code,
         lt.name as leave_type_name,
         lt.description,
         lt.is_paid,
         lt.allow_half_day,
         COALESCE(lb.id, 0) as id,
         ? as user_id,
         ? as academic_year,
         CAST(COALESCE(lb.entitled_days, lt.default_days_per_year) AS DOUBLE) as entitled_days,
         CAST(COALESCE(lb.used_days, 0) AS DOUBLE) as used_days,
         CAST(COALESCE(lb.pending_days, 0) AS DOUBLE) as pending_days,
         CAST((COALESCE(lb.entitled_days, lt.default_days_per_year) - COALESCE(lb.used_days, 0) - COALESCE(lb.pending_days, 0)) AS DOUBLE) as available_days
       FROM leave_types lt
       LEFT JOIN leave_balances lb 
         ON lt.id = lb.leave_type_id 
         AND lb.user_id = ? 
         AND lb.academic_year = ?
       ORDER BY lt.id ASC`,
      [userId, academicYear, userId, academicYear]
    );

    res.json({
      success: true,
      data: balances,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/leaves
 * Submit a new leave request with transaction & row-locking concurrency control
 */
export async function submitLeaveRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const connection = await pool.getConnection();

  try {
    const userId = req.user!.id;
    const departmentId = req.user!.departmentId;

    if (!departmentId) {
      throw new AppError('You must be assigned to an academic department to submit leave requests.', 400);
    }

    const parseResult = submitLeaveSchema.safeParse(req.body);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map(i => i.message).join(', ');
      throw new AppError(`Validation failed: ${issues}`, 400);
    }
    const parsed = parseResult.data;
    const academicYear = DEFAULT_ACADEMIC_YEAR;

    const daysCount = calculateLeaveDuration(parsed.startDate, parsed.endDate, parsed.isHalfDay);

    if (daysCount <= 0) {
      throw new AppError(
        'Leave duration must be greater than 0. The selected date range falls entirely on non-working days (Sundays).',
        400
      );
    }

    await connection.beginTransaction();

    // 1. Fetch leave type
    const [typeRows] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM leave_types WHERE id = ? FOR UPDATE',
      [parsed.leaveTypeId]
    );

    if (!typeRows.length) {
      throw new AppError('The requested leave type does not exist.', 404);
    }

    const leaveType = typeRows[0] as LeaveType;

    if (parsed.isHalfDay && !leaveType.allow_half_day) {
      throw new AppError(`Half-day leave is not permitted for leave type '${leaveType.name}'.`, 400);
    }

    // 2. Prevent overlapping requests
    const [overlapRows] = await connection.query<RowDataPacket[]>(
      `SELECT id, start_date, end_date, is_half_day, half_day_period, status
       FROM leave_requests
       WHERE user_id = ?
         AND status IN ('Pending', 'Approved')
         AND start_date <= ? AND end_date >= ?
       FOR UPDATE`,
      [userId, parsed.endDate, parsed.startDate]
    );

    if (overlapRows.length > 0) {
      // Check if it's two distinct half-days on the same date
      const isCleanHalfDaySplit =
        parsed.isHalfDay &&
        overlapRows.length === 1 &&
        overlapRows[0].is_half_day &&
        formatDate(overlapRows[0].start_date) === parsed.startDate &&
        overlapRows[0].half_day_period !== parsed.halfDayPeriod;

      if (!isCleanHalfDaySplit) {
        throw new AppError(
          'You already have a Pending or Approved leave request overlapping with the requested date range.',
          409
        );
      }
    }

    // 3. Balance verification and reservation (for paid leaves)
    if (leaveType.is_paid) {
      const [balanceRows] = await connection.query<RowDataPacket[]>(
        `SELECT id, entitled_days, used_days, pending_days
         FROM leave_balances
         WHERE user_id = ? AND leave_type_id = ? AND academic_year = ?
         FOR UPDATE`,
        [userId, parsed.leaveTypeId, academicYear]
      );

      let balanceId: number;
      let entitled: number;
      let used: number;
      let pending: number;

      if (!balanceRows.length) {
        // Initialize balance record if missing
        entitled = Number(leaveType.default_days_per_year);
        used = 0;
        pending = 0;

        const [insertRes] = await connection.query<ResultSetHeader>(
          `INSERT INTO leave_balances (user_id, leave_type_id, academic_year, entitled_days, used_days, pending_days)
           VALUES (?, ?, ?, ?, 0.0, 0.0)`,
          [userId, parsed.leaveTypeId, academicYear, entitled]
        );
        balanceId = insertRes.insertId;
      } else {
        balanceId = balanceRows[0].id;
        entitled = Number(balanceRows[0].entitled_days);
        used = Number(balanceRows[0].used_days);
        pending = Number(balanceRows[0].pending_days);
      }

      const available = entitled - used - pending;

      if (available < daysCount) {
        throw new AppError(
          `Insufficient leave balance. You requested ${daysCount} day(s), but only ${available} day(s) remain available for ${leaveType.name}.`,
          400
        );
      }

      // Reserve the days
      await connection.query(
        `UPDATE leave_balances 
         SET pending_days = pending_days + ? 
         WHERE id = ?`,
        [daysCount, balanceId]
      );
    }

    // 4. Create the leave request
    const [reqResult] = await connection.query<ResultSetHeader>(
      `INSERT INTO leave_requests (
         user_id, department_id, leave_type_id, start_date, end_date,
         days_count, is_half_day, half_day_period, reason, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [
        userId,
        departmentId,
        parsed.leaveTypeId,
        parsed.startDate,
        parsed.endDate,
        daysCount,
        parsed.isHalfDay ? 1 : 0,
        parsed.isHalfDay ? parsed.halfDayPeriod : null,
        parsed.reason,
      ]
    );

    const requestId = reqResult.insertId;

    // 5. Audit record
    await connection.query(
      `INSERT INTO leave_audit_logs (request_id, user_id, action, new_status, performed_by, notes)
       VALUES (?, ?, 'SUBMITTED', 'Pending', ?, ?)`,
      [requestId, userId, userId, `Submitted ${daysCount} day(s) leave request.`]
    );

    // Phase 7: Enqueue submission acknowledgement to requester
    await enqueueNotification(
      {
        idempotencyKey: `leave-submitted-${requestId}-${userId}`,
        eventType: NOTIFICATION_EVENTS.LEAVE_SUBMITTED,
        recipientEmail: req.user!.email,
        recipientName: req.user!.fullName,
        recipientId: userId,
        templateId: NOTIFICATION_EVENTS.LEAVE_SUBMITTED,
        payload: {
          leaveTypeName: leaveType.name,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          daysCount,
        },
      },
      connection
    );

    // Phase 7: Enqueue notification to departmental HOD(s)
    const [hodRows] = await connection.query<RowDataPacket[]>(
      `SELECT id, email, full_name FROM users WHERE department_id = ? AND role = 'HOD' AND is_active = 1 AND id != ?`,
      [departmentId, userId]
    );
    for (const hod of hodRows) {
      await enqueueNotification(
        {
          idempotencyKey: `leave-pending-${requestId}-${hod.id}`,
          eventType: NOTIFICATION_EVENTS.LEAVE_PENDING_APPROVAL,
          recipientEmail: hod.email,
          recipientName: hod.full_name,
          recipientId: hod.id,
          templateId: NOTIFICATION_EVENTS.LEAVE_PENDING_APPROVAL,
          payload: {
            requesterName: req.user!.fullName,
            leaveTypeName: leaveType.name,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
            daysCount,
            reason: parsed.reason,
          },
        },
        connection
      );
    }

    await connection.commit();

    await logAuditEvent({
      actorId: userId,
      action: 'LEAVE_REQUEST_SUBMITTED',
      targetType: 'LEAVE_REQUEST',
      targetId: requestId,
      details: {
        leaveTypeId: parsed.leaveTypeId,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        daysCount,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Leave request submitted successfully.',
      data: {
        id: requestId,
        userId,
        departmentId,
        leaveTypeId: parsed.leaveTypeId,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        daysCount,
        isHalfDay: parsed.isHalfDay,
        halfDayPeriod: parsed.halfDayPeriod || null,
        reason: parsed.reason,
        status: LEAVE_STATUSES.PENDING,
      },
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
}

/**
 * GET /api/leaves/my
 * Retrieve all leave requests submitted by the authenticated user
 */
export async function getMyLeaveRequests(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const { status } = req.query;

    let query = `
      SELECT 
        lr.id, lr.user_id, lr.department_id, lr.leave_type_id,
        lr.start_date, lr.end_date,
        CAST(lr.days_count AS DOUBLE) as days_count,
        lr.is_half_day, lr.half_day_period, lr.reason, lr.status,
        lr.approver_id, lr.decision_notes, lr.decision_timestamp,
        lr.created_at, lr.updated_at,
        lt.code as leave_type_code,
        lt.name as leave_type_name,
        lt.is_paid,
        u_app.full_name as approver_name
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      LEFT JOIN users u_app ON lr.approver_id = u_app.id
      WHERE lr.user_id = ?
    `;

    const params: any[] = [userId];

    if (status && status !== 'ALL') {
      query += ' AND lr.status = ?';
      params.push(status);
    }

    query += ' ORDER BY lr.created_at DESC';

    const [rows] = await pool.query<RowDataPacket[]>(query, params);

    const formatted = rows.map(r => ({
      ...r,
      start_date: formatDate(r.start_date),
      end_date: formatDate(r.end_date),
      is_half_day: Boolean(r.is_half_day),
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/leaves/approvals
 * Retrieve requests awaiting decision in the HOD's department (excluding HOD's own requests)
 */
export async function getPendingApprovals(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userRole = req.user!.role;
    const userDeptId = req.user!.departmentId;
    const userId = req.user!.id;

    if (userRole !== ROLES.HOD || !userDeptId) {
      throw new AppError('Only Department HODs can view the leave approval queue.', 403);
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         lr.id, lr.user_id, lr.department_id, lr.leave_type_id,
         lr.start_date, lr.end_date,
         CAST(lr.days_count AS DOUBLE) as days_count,
         lr.is_half_day, lr.half_day_period, lr.reason, lr.status,
         lr.created_at, lr.updated_at,
         lt.code as leave_type_code,
         lt.name as leave_type_name,
         lt.is_paid,
         u_req.full_name as requester_name,
         u_req.email as requester_email,
         u_req.role as requester_role,
         d.name as department_name,
         d.code as department_code
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       JOIN users u_req ON lr.user_id = u_req.id
       JOIN departments d ON lr.department_id = d.id
       WHERE lr.department_id = ?
         AND lr.status = 'Pending'
         AND lr.user_id != ?
       ORDER BY lr.created_at ASC`,
      [userDeptId, userId]
    );

    const formatted = rows.map(r => ({
      ...r,
      start_date: formatDate(r.start_date),
      end_date: formatDate(r.end_date),
      is_half_day: Boolean(r.is_half_day),
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/leaves/department-summary
 * Department leave metrics and recent history for HOD
 */
export async function getDepartmentLeaveSummary(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userRole = req.user!.role;
    const deptId = req.user!.departmentId;

    if (userRole !== ROLES.HOD || !deptId) {
      throw new AppError('Only Department HODs can access department leave summaries.', 403);
    }

    // Counts
    const [counts] = await pool.query<RowDataPacket[]>(
      `SELECT 
         COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending_count,
         COUNT(CASE WHEN status = 'Approved' THEN 1 END) as approved_count,
         COUNT(CASE WHEN status = 'Rejected' THEN 1 END) as rejected_count,
         COUNT(CASE WHEN status = 'Approved' AND CURDATE() BETWEEN start_date AND end_date THEN 1 END) as active_today_count
       FROM leave_requests
       WHERE department_id = ?`,
      [deptId]
    );

    // Recent requests
    const [recent] = await pool.query<RowDataPacket[]>(
      `SELECT 
         lr.id, lr.user_id, lr.start_date, lr.end_date,
         CAST(lr.days_count AS DOUBLE) as days_count,
         lr.is_half_day, lr.status, lr.reason, lr.created_at,
         lt.name as leave_type_name,
         u.full_name as requester_name,
         u.role as requester_role
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       JOIN users u ON lr.user_id = u.id
       WHERE lr.department_id = ?
       ORDER BY lr.created_at DESC
       LIMIT 10`,
      [deptId]
    );

    const formattedRecent = recent.map(r => ({
      ...r,
      start_date: formatDate(r.start_date),
      end_date: formatDate(r.end_date),
      is_half_day: Boolean(r.is_half_day),
    }));

    res.json({
      success: true,
      data: {
        metrics: counts[0] || {
          pending_count: 0,
          approved_count: 0,
          rejected_count: 0,
          active_today_count: 0,
        },
        recentRequests: formattedRecent,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/leaves/:id
 * Retrieve specific leave request with authorization checks
 */
export async function getLeaveRequestById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const requestId = Number(req.params.id);
    if (!requestId || isNaN(requestId)) {
      throw new AppError('Invalid leave request ID.', 400);
    }

    const userId = req.user!.id;
    const userRole = req.user!.role;
    const userDeptId = req.user!.departmentId;

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         lr.id, lr.user_id, lr.department_id, lr.leave_type_id,
         lr.start_date, lr.end_date,
         CAST(lr.days_count AS DOUBLE) as days_count,
         lr.is_half_day, lr.half_day_period, lr.reason, lr.status,
         lr.approver_id, lr.decision_notes, lr.decision_timestamp,
         lr.created_at, lr.updated_at,
         lt.code as leave_type_code,
         lt.name as leave_type_name,
         lt.is_paid,
         u_req.full_name as requester_name,
         u_req.email as requester_email,
         u_req.role as requester_role,
         d.name as department_name,
         d.code as department_code,
         u_app.full_name as approver_name
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       JOIN users u_req ON lr.user_id = u_req.id
       JOIN departments d ON lr.department_id = d.id
       LEFT JOIN users u_app ON lr.approver_id = u_app.id
       WHERE lr.id = ?`,
      [requestId]
    );

    if (!rows.length) {
      throw new AppError('Leave request not found.', 404);
    }

    const request = rows[0];

    // Authorization checks:
    // Requester can view own request
    // HOD of same department can view
    // System Admin can view
    const isOwner = request.user_id === userId;
    const isDeptHOD = userRole === ROLES.HOD && request.department_id === userDeptId;
    const isAdmin = userRole === ROLES.SYSTEM_ADMIN;

    if (!isOwner && !isDeptHOD && !isAdmin) {
      throw new AppError('You are not authorized to view this leave request.', 403);
    }

    // Audit logs for this request
    const [auditLogs] = await pool.query<RowDataPacket[]>(
      `SELECT lal.*, u.full_name as performer_name
       FROM leave_audit_logs lal
       JOIN users u ON lal.performed_by = u.id
       WHERE lal.request_id = ?
       ORDER BY lal.created_at ASC`,
      [requestId]
    );

    res.json({
      success: true,
      data: {
        ...request,
        start_date: formatDate(request.start_date),
        end_date: formatDate(request.end_date),
        is_half_day: Boolean(request.is_half_day),
        auditLogs,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/leaves/:id/decision
 * HOD Approve or Reject leave request with atomic row-locking balance adjustments
 */
export async function decideLeaveRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const connection = await pool.getConnection();

  try {
    const requestId = Number(req.params.id);
    if (!requestId || isNaN(requestId)) {
      throw new AppError('Invalid leave request ID.', 400);
    }

    const approverId = req.user!.id;
    const approverRole = req.user!.role;
    const approverDeptId = req.user!.departmentId;

    // Strict role check: Only HOD can approve/reject departmental leaves
    if (approverRole !== ROLES.HOD) {
      throw new AppError('Only the Head of Department (HOD) is authorized to decide leave requests.', 403);
    }

    const parseResult = decideLeaveSchema.safeParse(req.body);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map(i => i.message).join(', ');
      throw new AppError(`Validation failed: ${issues}`, 400);
    }
    const parsed = parseResult.data;
    const academicYear = DEFAULT_ACADEMIC_YEAR;

    await connection.beginTransaction();

    // 1. Fetch leave request with row lock
    const [requestRows] = await connection.query<RowDataPacket[]>(
      `SELECT * FROM leave_requests WHERE id = ? FOR UPDATE`,
      [requestId]
    );

    if (!requestRows.length) {
      throw new AppError('Leave request not found.', 404);
    }

    const leaveReq = requestRows[0];

    // 2. Department isolation check
    if (leaveReq.department_id !== approverDeptId) {
      throw new AppError('Cross-department leave approval is strictly prohibited.', 403);
    }

    // 3. Prevention of self-approval
    if (leaveReq.user_id === approverId) {
      throw new AppError('Self-approval is strictly prohibited. HODs cannot approve their own leave requests.', 403);
    }

    // 4. Valid state machine check
    if (leaveReq.status !== LEAVE_STATUSES.PENDING) {
      throw new AppError(
        `Invalid state transition. Leave request is already '${leaveReq.status}' and cannot be decided again.`,
        400
      );
    }

    // 5. Fetch leave type
    const [typeRows] = await connection.query<RowDataPacket[]>(
      `SELECT * FROM leave_types WHERE id = ? FOR UPDATE`,
      [leaveReq.leave_type_id]
    );
    const leaveType = typeRows[0] as LeaveType;

    const daysCount = Number(leaveReq.days_count);

    // 6. Update balances atomically if paid leave
    if (leaveType.is_paid) {
      const [balanceRows] = await connection.query<RowDataPacket[]>(
        `SELECT id, entitled_days, used_days, pending_days
         FROM leave_balances
         WHERE user_id = ? AND leave_type_id = ? AND academic_year = ?
         FOR UPDATE`,
        [leaveReq.user_id, leaveReq.leave_type_id, academicYear]
      );

      if (balanceRows.length > 0) {
        const bal = balanceRows[0];
        if (parsed.status === LEAVE_STATUSES.APPROVED) {
          // Release reservation and deduct from balance
          await connection.query(
            `UPDATE leave_balances
             SET pending_days = GREATEST(0.0, pending_days - ?),
                 used_days = used_days + ?
             WHERE id = ?`,
            [daysCount, daysCount, bal.id]
          );
        } else if (parsed.status === LEAVE_STATUSES.REJECTED) {
          // Release reservation without incrementing used_days
          await connection.query(
            `UPDATE leave_balances
             SET pending_days = GREATEST(0.0, pending_days - ?)
             WHERE id = ?`,
            [daysCount, bal.id]
          );
        }
      }
    }

    // 7. Update leave request record
    await connection.query(
      `UPDATE leave_requests
       SET status = ?,
           approver_id = ?,
           decision_notes = ?,
           decision_timestamp = NOW()
       WHERE id = ?`,
      [parsed.status, approverId, parsed.decisionNotes || null, requestId]
    );

    // 8. Record audit log
    await connection.query(
      `INSERT INTO leave_audit_logs (request_id, user_id, action, previous_status, new_status, performed_by, notes)
       VALUES (?, ?, ?, 'Pending', ?, ?, ?)`,
      [
        requestId,
        leaveReq.user_id,
        parsed.status.toUpperCase(),
        parsed.status,
        approverId,
        parsed.decisionNotes || `Decision marked as ${parsed.status}.`,
      ]
    );

    // Phase 7: Fetch requester details for decision notification
    const [requesterRows] = await connection.query<RowDataPacket[]>(
      'SELECT email, full_name FROM users WHERE id = ?',
      [leaveReq.user_id]
    );
    if (requesterRows.length > 0) {
      const requester = requesterRows[0];
      const isApproved = parsed.status === 'Approved';
      const eventType = isApproved ? NOTIFICATION_EVENTS.LEAVE_APPROVED : NOTIFICATION_EVENTS.LEAVE_REJECTED;

      await enqueueNotification(
        {
          idempotencyKey: `leave-decided-${requestId}-${parsed.status.toLowerCase()}`,
          eventType,
          recipientEmail: requester.email,
          recipientName: requester.full_name,
          recipientId: leaveReq.user_id,
          templateId: eventType,
          payload: {
            leaveTypeName: leaveType.name,
            startDate: formatDate(leaveReq.start_date),
            endDate: formatDate(leaveReq.end_date),
            daysCount,
            approverName: req.user!.fullName,
            decisionNotes: parsed.decisionNotes || (isApproved ? 'Approved by Department HOD.' : 'Request could not be accommodated.'),
          },
        },
        connection
      );
    }

    await connection.commit();

    await logAuditEvent({
      actorId: approverId,
      action: `LEAVE_REQUEST_${parsed.status.toUpperCase()}`,
      targetType: 'LEAVE_REQUEST',
      targetId: requestId,
      details: {
        requesterId: leaveReq.user_id,
        status: parsed.status,
        decisionNotes: parsed.decisionNotes,
      },
    });

    res.json({
      success: true,
      message: `Leave request has been ${parsed.status.toLowerCase()} successfully.`,
      data: {
        id: requestId,
        status: parsed.status,
        decisionNotes: parsed.decisionNotes || null,
        approverId,
      },
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
}

/**
 * POST /api/leaves/:id/cancel
 * Cancel an eligible Pending or Approved leave request by the requester
 */
export async function cancelLeaveRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const connection = await pool.getConnection();

  try {
    const requestId = Number(req.params.id);
    if (!requestId || isNaN(requestId)) {
      throw new AppError('Invalid leave request ID.', 400);
    }

    const userId = req.user!.id;
    const parseResult = cancelLeaveSchema.safeParse(req.body);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map(i => i.message).join(', ');
      throw new AppError(`Validation failed: ${issues}`, 400);
    }
    const parsed = parseResult.data;
    const academicYear = DEFAULT_ACADEMIC_YEAR;

    await connection.beginTransaction();

    // 1. Fetch request with row lock
    const [requestRows] = await connection.query<RowDataPacket[]>(
      `SELECT * FROM leave_requests WHERE id = ? FOR UPDATE`,
      [requestId]
    );

    if (!requestRows.length) {
      throw new AppError('Leave request not found.', 404);
    }

    const leaveReq = requestRows[0];

    // 2. Ownership check
    if (leaveReq.user_id !== userId) {
      throw new AppError('You can only cancel your own leave requests.', 403);
    }

    // 3. State transition check: Can only cancel Pending or Approved
    if (
      leaveReq.status !== LEAVE_STATUSES.PENDING &&
      leaveReq.status !== LEAVE_STATUSES.APPROVED
    ) {
      throw new AppError(
        `Cannot cancel a leave request with current status '${leaveReq.status}'. Only Pending or Approved requests can be cancelled.`,
        400
      );
    }

    const prevStatus = leaveReq.status;
    const daysCount = Number(leaveReq.days_count);

    // 4. Fetch leave type
    const [typeRows] = await connection.query<RowDataPacket[]>(
      `SELECT * FROM leave_types WHERE id = ? FOR UPDATE`,
      [leaveReq.leave_type_id]
    );
    const leaveType = typeRows[0] as LeaveType;

    // 5. Release reserved or used balance
    if (leaveType.is_paid) {
      const [balanceRows] = await connection.query<RowDataPacket[]>(
        `SELECT id, entitled_days, used_days, pending_days
         FROM leave_balances
         WHERE user_id = ? AND leave_type_id = ? AND academic_year = ?
         FOR UPDATE`,
        [userId, leaveReq.leave_type_id, academicYear]
      );

      if (balanceRows.length > 0) {
        const bal = balanceRows[0];
        if (prevStatus === LEAVE_STATUSES.PENDING) {
          // Release pending reservation
          await connection.query(
            `UPDATE leave_balances
             SET pending_days = GREATEST(0.0, pending_days - ?)
             WHERE id = ?`,
            [daysCount, bal.id]
          );
        } else if (prevStatus === LEAVE_STATUSES.APPROVED) {
          // Restore used days
          await connection.query(
            `UPDATE leave_balances
             SET used_days = GREATEST(0.0, used_days - ?)
             WHERE id = ?`,
            [daysCount, bal.id]
          );
        }
      }
    }

    // 6. Update request status
    await connection.query(
      `UPDATE leave_requests
       SET status = 'Cancelled'
       WHERE id = ?`,
      [requestId]
    );

    // 7. Audit log
    await connection.query(
      `INSERT INTO leave_audit_logs (request_id, user_id, action, previous_status, new_status, performed_by, notes)
       VALUES (?, ?, 'CANCELLED', ?, 'Cancelled', ?, ?)`,
      [
        requestId,
        userId,
        prevStatus,
        userId,
        parsed.notes || 'Cancelled by requester.',
      ]
    );

    // Phase 7: Enqueue cancellation notification to requester
    await enqueueNotification(
      {
        idempotencyKey: `leave-cancelled-${requestId}`,
        eventType: NOTIFICATION_EVENTS.LEAVE_CANCELLED,
        recipientEmail: req.user!.email,
        recipientName: req.user!.fullName,
        recipientId: userId,
        templateId: NOTIFICATION_EVENTS.LEAVE_CANCELLED,
        payload: {
          leaveTypeName: leaveType.name,
          startDate: formatDate(leaveReq.start_date),
          endDate: formatDate(leaveReq.end_date),
          reason: parsed.notes || 'Cancelled by requester',
        },
      },
      connection
    );

    await connection.commit();

    await logAuditEvent({
      actorId: userId,
      action: 'LEAVE_REQUEST_CANCELLED',
      targetType: 'LEAVE_REQUEST',
      targetId: requestId,
      details: {
        previousStatus: prevStatus,
        notes: parsed.notes,
      },
    });

    res.json({
      success: true,
      message: 'Leave request cancelled successfully. Any reserved balances have been restored.',
      data: {
        id: requestId,
        status: LEAVE_STATUSES.CANCELLED,
      },
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
}

/**
 * GET /api/leaves/admin/policies
 * List all leave types and policy settings (System Admin only)
 */
export async function getAdminLeavePolicies(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.user!.role !== ROLES.SYSTEM_ADMIN) {
      throw new AppError('Only System Administrators can access policy management.', 403);
    }

    const [types] = await pool.query<RowDataPacket[]>(
      `SELECT lt.*,
              COUNT(DISTINCT lb.user_id) as enrolled_faculty_count
       FROM leave_types lt
       LEFT JOIN leave_balances lb ON lt.id = lb.leave_type_id
       GROUP BY lt.id
       ORDER BY lt.id ASC`
    );

    res.json({
      success: true,
      data: types,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/leaves/admin/policies/:id
 * Update policy rules for a leave type (System Admin only)
 */
export async function updateLeavePolicy(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.user!.role !== ROLES.SYSTEM_ADMIN) {
      throw new AppError('Only System Administrators can update leave policies.', 403);
    }

    const policyId = Number(req.params.id);
    if (!policyId || isNaN(policyId)) {
      throw new AppError('Invalid leave policy ID.', 400);
    }
    const { defaultDaysPerYear, allowHalfDay, description } = req.body;

    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT id, name FROM leave_types WHERE id = ?',
      [policyId]
    );

    if (!existing.length) {
      throw new AppError('Leave type not found.', 404);
    }

    await pool.query(
      `UPDATE leave_types
       SET default_days_per_year = COALESCE(?, default_days_per_year),
           allow_half_day = COALESCE(?, allow_half_day),
           description = COALESCE(?, description)
       WHERE id = ?`,
      [defaultDaysPerYear, allowHalfDay, description, policyId]
    );

    await logAuditEvent({
      actorId: req.user!.id,
      action: 'LEAVE_POLICY_UPDATED',
      targetType: 'LEAVE_POLICY',
      targetId: policyId,
      details: { defaultDaysPerYear, allowHalfDay },
    });

    res.json({
      success: true,
      message: 'Leave policy updated successfully.',
    });
  } catch (error) {
    next(error);
  }
}

