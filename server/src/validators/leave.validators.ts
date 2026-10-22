import { z } from 'zod';
import { HALF_DAY_PERIODS } from '../constants/leave.js';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const submitLeaveSchema = z
  .object({
    leaveTypeId: z.number({ required_error: 'Leave type ID is required' }).int().positive(),
    startDate: z
      .string({ required_error: 'Start date is required' })
      .regex(DATE_REGEX, 'Start date must be in YYYY-MM-DD format')
      .refine(val => !isNaN(Date.parse(val)), { message: 'Invalid start date' }),
    endDate: z
      .string({ required_error: 'End date is required' })
      .regex(DATE_REGEX, 'End date must be in YYYY-MM-DD format')
      .refine(val => !isNaN(Date.parse(val)), { message: 'Invalid end date' }),
    isHalfDay: z.boolean().optional().default(false),
    halfDayPeriod: z
      .enum([HALF_DAY_PERIODS.FIRST_HALF, HALF_DAY_PERIODS.SECOND_HALF])
      .nullable()
      .optional(),
    reason: z
      .string({ required_error: 'Reason is required' })
      .trim()
      .min(5, 'Reason must be at least 5 characters')
      .max(1000, 'Reason cannot exceed 1000 characters'),
  })
  .refine(
    data => {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      return start <= end;
    },
    {
      message: 'Start date cannot be after end date',
      path: ['endDate'],
    }
  )
  .refine(
    data => {
      if (data.isHalfDay) {
        return data.startDate === data.endDate;
      }
      return true;
    },
    {
      message: 'Half-day leave must start and end on the same single date',
      path: ['endDate'],
    }
  )
  .refine(
    data => {
      if (data.isHalfDay) {
        return !!data.halfDayPeriod;
      }
      return true;
    },
    {
      message: 'Half-day period (First Half or Second Half) is required for half-day leave',
      path: ['halfDayPeriod'],
    }
  );

export const decideLeaveSchema = z.object({
  status: z.enum(['Approved', 'Rejected'], {
    errorMap: () => ({ message: 'Decision status must be Approved or Rejected' }),
  }),
  decisionNotes: z
    .string()
    .trim()
    .max(1000, 'Decision notes cannot exceed 1000 characters')
    .nullable()
    .optional(),
});

export const cancelLeaveSchema = z.object({
  notes: z
    .string()
    .trim()
    .max(1000, 'Cancellation notes cannot exceed 1000 characters')
    .nullable()
    .optional(),
});

export const leaveFilterSchema = z.object({
  status: z.enum(['Pending', 'Approved', 'Rejected', 'Cancelled', 'ALL']).optional(),
  academicYear: z.string().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
});
