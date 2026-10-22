import { Role } from '../constants/roles.js';

export interface UserRecord {
  id: number;
  email: string;
  password_hash: string;
  full_name: string;
  role: Role;
  department_id: number | null;
  can_assign_work: boolean | number;
  is_active: boolean | number;
  created_at: Date;
  updated_at: Date;
}

export interface DepartmentRecord {
  id: number;
  code: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

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

export interface AuthenticatedUser {
  id: number;
  email: string;
  role: Role;
  departmentId: number | null;
  canAssignWork: boolean;
  fullName: string;
}

export interface JWTAccessPayload {
  userId: number;
  email: string;
  role: Role;
  departmentId: number | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
