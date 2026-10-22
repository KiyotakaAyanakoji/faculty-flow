export type SyllabusStatus = 'Draft' | 'In Progress' | 'Completed';

export interface SyllabusUnit {
  unitNumber: number;
  title: string;
  hours?: number;
  status: 'Pending' | 'In Progress' | 'Completed';
}

export interface Syllabus {
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
