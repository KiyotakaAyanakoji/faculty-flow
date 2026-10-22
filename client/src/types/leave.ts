export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
export type HalfDayPeriod = 'First Half' | 'Second Half';

export interface LeaveType {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_paid: boolean;
  default_days_per_year: number;
  requires_approval: boolean;
  allow_half_day: boolean;
}

export interface LeaveBalance {
  id: number;
  user_id: number;
  leave_type_id: number;
  leave_type_code: string;
  leave_type_name: string;
  academic_year: string;
  entitled_days: number;
  used_days: number;
  pending_days: number;
  available_days: number;
  is_paid: boolean;
  allow_half_day: boolean;
  description?: string;
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
  leave_type_code?: string;
  leave_type_name?: string;
  is_paid?: boolean;
  requester_name?: string;
  requester_email?: string;
  requester_role?: string;
  department_name?: string;
  department_code?: string;
  approver_name?: string;
}

export interface DepartmentLeaveMetrics {
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  active_today_count: number;
}
