import { HandoverStatus } from '../constants/roles.js';

export interface HandoverRecord {
  id: number;
  sender_id: number;
  recipient_id: number;
  department_id: number;
  task_id: number | null;
  title: string;
  notes: string;
  response_notes: string | null;
  status: HandoverStatus;
  due_date: string | Date | null;
  completed_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  sender_name?: string;
  sender_email?: string;
  sender_role?: string;
  recipient_name?: string;
  recipient_email?: string;
  recipient_role?: string;
  department_name?: string;
  department_code?: string;
  task_title?: string;
  task_status?: string;
  task_category?: string;
}

export interface HandoverResponse {
  id: number;
  title: string;
  notes: string;
  responseNotes: string | null;
  status: HandoverStatus;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sender: {
    id: number;
    fullName: string;
    email: string;
    role: string;
  };
  recipient: {
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
  task: {
    id: number;
    title: string;
    status: string;
    category: string;
  } | null;
}
