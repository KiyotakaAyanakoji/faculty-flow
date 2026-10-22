export const LEAVE_STATUSES = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
} as const;

export type LeaveStatus = typeof LEAVE_STATUSES[keyof typeof LEAVE_STATUSES];

export const ALL_LEAVE_STATUSES: LeaveStatus[] = [
  LEAVE_STATUSES.PENDING,
  LEAVE_STATUSES.APPROVED,
  LEAVE_STATUSES.REJECTED,
  LEAVE_STATUSES.CANCELLED,
];

export const HALF_DAY_PERIODS = {
  FIRST_HALF: 'First Half',
  SECOND_HALF: 'Second Half',
} as const;

export type HalfDayPeriod = typeof HALF_DAY_PERIODS[keyof typeof HALF_DAY_PERIODS];

export const DEFAULT_ACADEMIC_YEAR = '2026-2027';
