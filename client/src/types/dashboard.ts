import { Role } from './auth';
import { TaskCategory, TaskPriority } from './task';

export interface AdminDashboardData {
  role: 'SYSTEM_ADMIN';
  users: {
    total: number;
    active: number;
    inactive: number;
    byRole: Record<Role, number>;
  };
  departments: Array<{
    id: number;
    name: string;
    code: string;
    facultyCount: number;
  }>;
  recentAuditLogs: Array<{
    id: number;
    action: string;
    actorName: string;
    targetType: string;
    createdAt: string;
  }>;
}

export interface FacultyWorkloadItem {
  facultyId: number;
  fullName: string;
  email: string;
  role: Role;
  pendingTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  overdueTasks: number;
  totalTasks: number;
}

export interface HodDashboardData {
  role: 'HOD';
  department: {
    id: number;
    name: string;
    code: string;
  };
  taskMetrics: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    overdue: number;
    upcoming: number;
    byPriority: Record<TaskPriority, number>;
    byCategory?: Record<string, number>;
  };
  facultyWorkload: FacultyWorkloadItem[];
  syllabusOverview: {
    totalCourses: number;
    inProgress: number;
    completed: number;
    draft: number;
    averageCompletionPercentage: number;
  };
  handoversCount: {
    pending: number;
    total: number;
  };
}

export interface ProfessorDashboardData {
  role: 'PROFESSOR';
  department: {
    id: number;
    name: string;
    code: string;
  };
  assignedTasks: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    overdue: number;
    upcoming: number;
  };
  createdTasks: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
  };
  upcomingDeadlines: Array<{
    id: number;
    title: string;
    category?: TaskCategory;
    priority: TaskPriority;
    dueDate: string;
    status: string;
  }>;
  assignedSyllabuses: Array<{
    id: number;
    courseCode: string;
    courseName: string;
    semester: string;
    completionPercentage: number;
    status: string;
  }>;
  activeHandoversCount: {
    sent: number;
    received: number;
  };
}

export interface AssistantProfessorDashboardData {
  role: 'ASSISTANT_PROFESSOR';
  department: {
    id: number;
    name: string;
    code: string;
  };
  assignedTasks: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    overdue: number;
    upcoming: number;
  };
  delegatedCreatedTasks?: {
    total: number;
    pending: number;
    completed: number;
  };
  upcomingDeadlines: Array<{
    id: number;
    title: string;
    category?: TaskCategory;
    priority: TaskPriority;
    dueDate: string;
    status: string;
  }>;
  assignedSyllabuses: Array<{
    id: number;
    courseCode: string;
    courseName: string;
    semester: string;
    completionPercentage: number;
    status: string;
  }>;
  pendingHandoversToRespond: number;
}

export type DashboardResponseData =
  | AdminDashboardData
  | HodDashboardData
  | ProfessorDashboardData
  | AssistantProfessorDashboardData;
