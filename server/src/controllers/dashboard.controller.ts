import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  ROLES,
  Role,
  ALL_ROLES,
  ALL_TASK_CATEGORIES,
  ALL_TASK_PRIORITIES,
  TaskCategory,
  TaskPriority,
} from '../constants/roles.js';
import {
  AdminDashboardData,
  HodDashboardData,
  ProfessorDashboardData,
  AssistantProfessorDashboardData,
} from '../types/dashboard.types.js';

export async function getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const { role, id: userId, departmentId } = req.user;

    // 1. SYSTEM ADMIN DASHBOARD
    if (role === ROLES.SYSTEM_ADMIN) {
      // User counts
      const [userStats] = await pool.query<any[]>(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive
         FROM users`
      );

      const [roleCounts] = await pool.query<any[]>(
        'SELECT role, COUNT(*) as count FROM users GROUP BY role'
      );

      const byRole: Record<Role, number> = {
        SYSTEM_ADMIN: 0,
        HOD: 0,
        PROFESSOR: 0,
        ASSISTANT_PROFESSOR: 0,
      };

      for (const r of roleCounts) {
        if (ALL_ROLES.includes(r.role)) {
          byRole[r.role as Role] = Number(r.count);
        }
      }

      // Departments with faculty count
      const [deptRows] = await pool.query<any[]>(
        `SELECT d.id, d.name, d.code, COUNT(u.id) as facultyCount
         FROM departments d
         LEFT JOIN users u ON d.id = u.department_id AND u.is_active = 1
         GROUP BY d.id, d.name, d.code
         ORDER BY d.code ASC`
      );

      // Recent audit logs
      const [auditRows] = await pool.query<any[]>(
        `SELECT al.id, al.action, al.target_type, al.created_at, u.full_name as actor_name
         FROM audit_logs al
         LEFT JOIN users u ON al.actor_id = u.id
         ORDER BY al.created_at DESC
         LIMIT 10`
      );

      const adminData: AdminDashboardData = {
        role: 'SYSTEM_ADMIN',
        users: {
          total: Number(userStats[0].total) || 0,
          active: Number(userStats[0].active) || 0,
          inactive: Number(userStats[0].inactive) || 0,
          byRole,
        },
        departments: deptRows.map(d => ({
          id: d.id,
          name: d.name,
          code: d.code,
          facultyCount: Number(d.facultyCount) || 0,
        })),
        recentAuditLogs: auditRows.map(al => ({
          id: al.id,
          action: al.action,
          actorName: al.actor_name || 'System',
          targetType: al.target_type,
          createdAt: new Date(al.created_at).toISOString(),
        })),
      };

      res.status(200).json({ success: true, dashboard: adminData });
      return;
    }

    // Must have department for academic roles
    if (!departmentId) {
      return next(new AppError('Academic role requires department assignment.', 400, 'DEPARTMENT_REQUIRED'));
    }

    // Fetch department details
    const [deptRows] = await pool.query<any[]>(
      'SELECT id, name, code FROM departments WHERE id = ?',
      [departmentId]
    );

    const department = {
      id: departmentId,
      name: deptRows[0]?.name || '',
      code: deptRows[0]?.code || '',
    };

    // 2. HOD DASHBOARD
    if (role === ROLES.HOD) {
      // Overall departmental task metrics
      const [taskTotals] = await pool.query<any[]>(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
           SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as inProgress,
           SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status != 'Completed' AND due_date < CURRENT_DATE() THEN 1 ELSE 0 END) as overdue,
           SUM(CASE WHEN status != 'Completed' AND due_date >= CURRENT_DATE() AND due_date <= DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as upcoming
         FROM tasks
         WHERE department_id = ?`,
        [departmentId]
      );

      // By Priority
      const [priorityRows] = await pool.query<any[]>(
        'SELECT priority, COUNT(*) as count FROM tasks WHERE department_id = ? GROUP BY priority',
        [departmentId]
      );
      const byPriority: Record<TaskPriority, number> = { Low: 0, Medium: 0, High: 0 };
      for (const p of priorityRows) {
        if (ALL_TASK_PRIORITIES.includes(p.priority)) {
          byPriority[p.priority as TaskPriority] = Number(p.count);
        }
      }

      // By Category
      const [categoryRows] = await pool.query<any[]>(
        'SELECT category, COUNT(*) as count FROM tasks WHERE department_id = ? GROUP BY category',
        [departmentId]
      );
      const byCategory: Record<TaskCategory, number> = {
        Teaching: 0,
        Research: 0,
        Grading: 0,
        Meetings: 0,
        Administrative: 0,
      };
      for (const c of categoryRows) {
        if (ALL_TASK_CATEGORIES.includes(c.category)) {
          byCategory[c.category as TaskCategory] = Number(c.count);
        }
      }

      // Faculty Workload distribution
      const [facultyWorkloadRows] = await pool.query<any[]>(
        `SELECT 
           u.id as facultyId,
           u.full_name as fullName,
           u.email,
           u.role,
           COUNT(t.id) as totalTasks,
           SUM(CASE WHEN t.status = 'Pending' THEN 1 ELSE 0 END) as pendingTasks,
           SUM(CASE WHEN t.status = 'In Progress' THEN 1 ELSE 0 END) as inProgressTasks,
           SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END) as completedTasks,
           SUM(CASE WHEN t.status != 'Completed' AND t.due_date < CURRENT_DATE() THEN 1 ELSE 0 END) as overdueTasks
         FROM users u
         LEFT JOIN tasks t ON u.id = t.assignee_id AND t.department_id = ?
         WHERE u.department_id = ? AND u.is_active = 1
         GROUP BY u.id, u.full_name, u.email, u.role
         ORDER BY totalTasks DESC, u.full_name ASC`,
        [departmentId, departmentId]
      );

      // Syllabus Overview
      const [syllabusRows] = await pool.query<any[]>(
        `SELECT 
           COUNT(*) as totalCourses,
           SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as inProgress,
           SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status = 'Draft' THEN 1 ELSE 0 END) as draft,
           COALESCE(AVG(completion_percentage), 0) as averageCompletionPercentage
         FROM syllabuses
         WHERE department_id = ?`,
        [departmentId]
      );

      // Handovers
      const [handoverRows] = await pool.query<any[]>(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending
         FROM handovers
         WHERE department_id = ?`,
        [departmentId]
      );

      const hodData: HodDashboardData = {
        role: 'HOD',
        department,
        taskMetrics: {
          total: Number(taskTotals[0].total) || 0,
          pending: Number(taskTotals[0].pending) || 0,
          inProgress: Number(taskTotals[0].inProgress) || 0,
          completed: Number(taskTotals[0].completed) || 0,
          overdue: Number(taskTotals[0].overdue) || 0,
          upcoming: Number(taskTotals[0].upcoming) || 0,
          byPriority,
          byCategory,
        },
        facultyWorkload: facultyWorkloadRows.map(f => ({
          facultyId: f.facultyId,
          fullName: f.fullName,
          email: f.email,
          role: f.role,
          pendingTasks: Number(f.pendingTasks) || 0,
          inProgressTasks: Number(f.inProgressTasks) || 0,
          completedTasks: Number(f.completedTasks) || 0,
          overdueTasks: Number(f.overdueTasks) || 0,
          totalTasks: Number(f.totalTasks) || 0,
        })),
        syllabusOverview: {
          totalCourses: Number(syllabusRows[0].totalCourses) || 0,
          inProgress: Number(syllabusRows[0].inProgress) || 0,
          completed: Number(syllabusRows[0].completed) || 0,
          draft: Number(syllabusRows[0].draft) || 0,
          averageCompletionPercentage: Number(Number(syllabusRows[0].averageCompletionPercentage).toFixed(2)) || 0,
        },
        handoversCount: {
          pending: Number(handoverRows[0].pending) || 0,
          total: Number(handoverRows[0].total) || 0,
        },
      };

      res.status(200).json({ success: true, dashboard: hodData });
      return;
    }

    // 3. PROFESSOR DASHBOARD
    if (role === ROLES.PROFESSOR) {
      // Assigned tasks
      const [assignedStats] = await pool.query<any[]>(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
           SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as inProgress,
           SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status != 'Completed' AND due_date < CURRENT_DATE() THEN 1 ELSE 0 END) as overdue,
           SUM(CASE WHEN status != 'Completed' AND due_date >= CURRENT_DATE() AND due_date <= DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as upcoming
         FROM tasks
         WHERE assignee_id = ? AND department_id = ?`,
        [userId, departmentId]
      );

      // Created tasks
      const [createdStats] = await pool.query<any[]>(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
           SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as inProgress,
           SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed
         FROM tasks
         WHERE creator_id = ? AND department_id = ?`,
        [userId, departmentId]
      );

      // Upcoming deadlines (next 5)
      const [upcomingRows] = await pool.query<any[]>(
        `SELECT id, title, category, priority, due_date, status
         FROM tasks
         WHERE assignee_id = ? AND department_id = ? AND status != 'Completed'
         ORDER BY FIELD(priority, 'High', 'Medium', 'Low'), due_date ASC
         LIMIT 5`,
        [userId, departmentId]
      );

      // Assigned syllabuses
      const [syllabusRows] = await pool.query<any[]>(
        `SELECT id, course_code, course_name, semester, completion_percentage, status
         FROM syllabuses
         WHERE faculty_id = ? AND department_id = ?
         ORDER BY course_code ASC`,
        [userId, departmentId]
      );

      // Active handovers (sent & received)
      const [handoverStats] = await pool.query<any[]>(
        `SELECT 
           SUM(CASE WHEN sender_id = ? THEN 1 ELSE 0 END) as sent,
           SUM(CASE WHEN recipient_id = ? THEN 1 ELSE 0 END) as received
         FROM handovers
         WHERE (sender_id = ? OR recipient_id = ?) AND department_id = ?`,
        [userId, userId, userId, userId, departmentId]
      );

      const profData: ProfessorDashboardData = {
        role: 'PROFESSOR',
        department,
        assignedTasks: {
          total: Number(assignedStats[0].total) || 0,
          pending: Number(assignedStats[0].pending) || 0,
          inProgress: Number(assignedStats[0].inProgress) || 0,
          completed: Number(assignedStats[0].completed) || 0,
          overdue: Number(assignedStats[0].overdue) || 0,
          upcoming: Number(assignedStats[0].upcoming) || 0,
        },
        createdTasks: {
          total: Number(createdStats[0].total) || 0,
          pending: Number(createdStats[0].pending) || 0,
          inProgress: Number(createdStats[0].inProgress) || 0,
          completed: Number(createdStats[0].completed) || 0,
        },
        upcomingDeadlines: upcomingRows.map(u => ({
          id: u.id,
          title: u.title,
          category: u.category,
          priority: u.priority,
          dueDate: u.due_date instanceof Date ? u.due_date.toISOString().slice(0, 10) : String(u.due_date).slice(0, 10),
          status: u.status,
        })),
        assignedSyllabuses: syllabusRows.map(s => ({
          id: s.id,
          courseCode: s.course_code,
          courseName: s.course_name,
          semester: s.semester,
          completionPercentage: Number(s.completion_percentage),
          status: s.status,
        })),
        activeHandoversCount: {
          sent: Number(handoverStats[0].sent) || 0,
          received: Number(handoverStats[0].received) || 0,
        },
      };

      res.status(200).json({ success: true, dashboard: profData });
      return;
    }

    // 4. ASSISTANT PROFESSOR DASHBOARD
    if (role === ROLES.ASSISTANT_PROFESSOR) {
      // Assigned tasks
      const [assignedStats] = await pool.query<any[]>(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
           SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as inProgress,
           SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status != 'Completed' AND due_date < CURRENT_DATE() THEN 1 ELSE 0 END) as overdue,
           SUM(CASE WHEN status != 'Completed' AND due_date >= CURRENT_DATE() AND due_date <= DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as upcoming
         FROM tasks
         WHERE assignee_id = ? AND department_id = ?`,
        [userId, departmentId]
      );

      // If delegated to assign work, count tasks created by them
      let delegatedCreatedTasks: { total: number; pending: number; completed: number } | undefined;
      if (req.user.canAssignWork) {
        const [createdStats] = await pool.query<any[]>(
          `SELECT 
             COUNT(*) as total,
             SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
             SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed
           FROM tasks
           WHERE creator_id = ? AND department_id = ?`,
          [userId, departmentId]
        );
        delegatedCreatedTasks = {
          total: Number(createdStats[0].total) || 0,
          pending: Number(createdStats[0].pending) || 0,
          completed: Number(createdStats[0].completed) || 0,
        };
      }

      // Upcoming deadlines (next 5)
      const [upcomingRows] = await pool.query<any[]>(
        `SELECT id, title, category, priority, due_date, status
         FROM tasks
         WHERE assignee_id = ? AND department_id = ? AND status != 'Completed'
         ORDER BY FIELD(priority, 'High', 'Medium', 'Low'), due_date ASC
         LIMIT 5`,
        [userId, departmentId]
      );

      // Assigned syllabuses
      const [syllabusRows] = await pool.query<any[]>(
        `SELECT id, course_code, course_name, semester, completion_percentage, status
         FROM syllabuses
         WHERE faculty_id = ? AND department_id = ?
         ORDER BY course_code ASC`,
        [userId, departmentId]
      );

      // Pending handovers where recipient is this faculty
      const [handoverStats] = await pool.query<any[]>(
        `SELECT COUNT(*) as pending
         FROM handovers
         WHERE recipient_id = ? AND status = 'Pending' AND department_id = ?`,
        [userId, departmentId]
      );

      const asstData: AssistantProfessorDashboardData = {
        role: 'ASSISTANT_PROFESSOR',
        department,
        assignedTasks: {
          total: Number(assignedStats[0].total) || 0,
          pending: Number(assignedStats[0].pending) || 0,
          inProgress: Number(assignedStats[0].inProgress) || 0,
          completed: Number(assignedStats[0].completed) || 0,
          overdue: Number(assignedStats[0].overdue) || 0,
          upcoming: Number(assignedStats[0].upcoming) || 0,
        },
        delegatedCreatedTasks,
        upcomingDeadlines: upcomingRows.map(u => ({
          id: u.id,
          title: u.title,
          category: u.category,
          priority: u.priority,
          dueDate: u.due_date instanceof Date ? u.due_date.toISOString().slice(0, 10) : String(u.due_date).slice(0, 10),
          status: u.status,
        })),
        assignedSyllabuses: syllabusRows.map(s => ({
          id: s.id,
          courseCode: s.course_code,
          courseName: s.course_name,
          semester: s.semester,
          completionPercentage: Number(s.completion_percentage),
          status: s.status,
        })),
        pendingHandoversToRespond: Number(handoverStats[0].pending) || 0,
      };

      res.status(200).json({ success: true, dashboard: asstData });
      return;
    }

    res.status(400).json({ success: false, message: 'Unrecognized user role' });
  } catch (error) {
    next(error);
  }
}
