import { z } from 'zod';
import { ALL_HANDOVER_STATUSES, HandoverStatus } from '../constants/roles.js';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateString(val: string): boolean {
  if (!DATE_REGEX.test(val)) return false;
  const date = new Date(val);
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === val;
}

export const createHandoverSchema = z.object({
  recipientId: z.coerce
    .number({ required_error: 'Recipient faculty ID is required' })
    .int()
    .positive(),
  taskId: z.coerce.number().int().positive().optional().nullable(),
  title: z
    .string({ required_error: 'Handover title is required' })
    .min(3, 'Title must be at least 3 characters')
    .max(255, 'Title cannot exceed 255 characters')
    .trim(),
  notes: z
    .string({ required_error: 'Handover context and notes are required' })
    .min(5, 'Notes must be at least 5 characters')
    .max(5000, 'Notes cannot exceed 5000 characters')
    .trim(),
  dueDate: z
    .string()
    .refine(isValidDateString, {
      message: 'Due date must be a valid date in YYYY-MM-DD format',
    })
    .optional()
    .nullable(),
});

export const updateHandoverStatusSchema = z.object({
  status: z.enum(['Accepted', 'Rejected', 'Completed'] as const, {
    required_error: 'Valid status update is required',
  }),
  responseNotes: z.string().trim().max(2000).optional().nullable(),
});

export const listHandoversQuerySchema = z.object({
  type: z.enum(['all', 'sent', 'received', 'department']).default('all'),
  status: z.enum(ALL_HANDOVER_STATUSES as [HandoverStatus, ...HandoverStatus[]]).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
