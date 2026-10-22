import { SyllabusStatus } from '../constants/roles.js';

export interface SyllabusUnit {
  unitNumber: number;
  title: string;
  hours?: number;
  status: 'Pending' | 'In Progress' | 'Completed';
}

export interface SyllabusRecord {
  id: number;
  department_id: number;
  course_code: string;
  course_name: string;
  academic_year: string;
  semester: string;
  total_units: number;
  completed_units: number;
  completion_percentage: number | string;
  status: SyllabusStatus;
  faculty_id: number | null;
  units: string | SyllabusUnit[] | null;
  created_at: string | Date;
  updated_at: string | Date;
  department_name?: string;
  department_code?: string;
  faculty_name?: string;
  faculty_email?: string;
  faculty_role?: string;
}

export interface SyllabusResponse {
  id: number;
  departmentId: number;
  courseCode: string;
  courseName: string;
  academicYear: string;
  semester: string;
  totalUnits: number;
  completedUnits: number;
  completionPercentage: number;
  status: SyllabusStatus;
  units: SyllabusUnit[];
  createdAt: string;
  updatedAt: string;
  department: {
    id: number;
    name: string;
    code: string;
  };
  faculty: {
    id: number;
    fullName: string;
    email: string;
    role: string;
  } | null;
}
