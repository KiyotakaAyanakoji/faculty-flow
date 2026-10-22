export type Role = 'SYSTEM_ADMIN' | 'HOD' | 'PROFESSOR' | 'ASSISTANT_PROFESSOR';

export type TaskCategory = 'Teaching' | 'Research' | 'Grading' | 'Meetings' | 'Administrative';

export interface UserProfile {
  id: number;
  email: string;
  fullName: string;
  role: Role;
  departmentId: number | null;
  departmentName?: string | null;
  departmentCode?: string | null;
  canAssignWork: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  id: number;
  code: string;
  name: string;
  description: string | null;
  facultyCount?: number;
  createdAt: string;
}
