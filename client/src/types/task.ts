export type TaskCategory = 'Teaching' | 'Research' | 'Grading' | 'Meetings' | 'Administrative';

export type TaskPriority = 'Low' | 'Medium' | 'High';

export type TaskStatus = 'Pending' | 'In Progress' | 'Completed';

export interface Task {
  id: number;
  title: string;
  description: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string; // YYYY-MM-DD
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

export interface TaskSummary {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  categoryBreakdown: Record<TaskCategory, number>;
}

export interface EligibleAssignee {
  id: number;
  fullName: string;
  email: string;
  role: string;
}
