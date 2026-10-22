import { TaskCategory, TaskPriority, TaskStatus } from '../constants/roles.js';

export interface TaskRecord {
  id: number;
  title: string;
  description: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | Date;
  creator_id: number;
  assignee_id: number;
  department_id: number;
  completed_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;

  // Joined fields
  creator_name?: string;
  creator_email?: string;
  creator_role?: string;
  assignee_name?: string;
  assignee_email?: string;
  assignee_role?: string;
  department_name?: string;
  department_code?: string;
}

export interface TaskResponse {
  id: number;
  title: string;
  description: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string; // ISO date format YYYY-MM-DD
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  creator: {
    id: number;
    fullName: string;
    email: string;
    role: string;
  };
  assignee: {
    id: number;
    fullName: string;
    email: string;
    role: string;
  };
  department: {
    id: number;
    name: string;
    code: string;
  };
}

export interface TaskSummaryResponse {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  categoryBreakdown: Record<TaskCategory, number>;
}
