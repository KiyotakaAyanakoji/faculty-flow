import { LeaveStatus, HalfDayPeriod } from '../constants/leave.js';

export interface LeaveType {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_paid: boolean;
  default_days_per_year: number;
  requires_approval: boolean;
  allow_half_day: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeaveBalance {
  id: number;
  user_id: number;
  leave_type_id: number;
  academic_year: string;
  entitled_days: number;
  used_days: number;
  pending_days: number;
  available_days?: number;
  leave_type_code?: string;
  leave_type_name?: string;
  is_paid?: boolean;
  allow_half_day?: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeaveRequest {
  id: number;
  user_id: number;
  department_id: number;
  leave_type_id: number;
  start_date: string;
  end_date: string;
  days_count: number;
  is_half_day: boolean;
  half_day_period: HalfDayPeriod | null;
  reason: string;
  status: LeaveStatus;
  approver_id: number | null;
  decision_notes: string | null;
  decision_timestamp: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  requester_name?: string;
  requester_email?: string;
  requester_role?: string;
  department_name?: string;
  department_code?: string;
  leave_type_code?: string;
  leave_type_name?: string;
  is_paid?: boolean;
  approver_name?: string;
}

export interface LeaveAuditLog {
  id: number;
  request_id: number | null;
  user_id: number;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  performed_by: number;
  notes: string | null;
  created_at: string;
  performer_name?: string;
}
