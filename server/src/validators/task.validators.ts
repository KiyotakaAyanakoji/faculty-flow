import { z } from 'zod';
import {
  ALL_TASK_CATEGORIES,
  ALL_TASK_PRIORITIES,
  ALL_TASK_STATUSES,
  TaskCategory,
  TaskPriority,
  TaskStatus,
} from '../constants/roles.js';

// Regex for YYYY-MM-DD format
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateString(val: string): boolean {
  if (!DATE_REGEX.test(val)) return false;
  const date = new Date(val);
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === val;
}

export const createTaskSchema = z.object({
  title: z
    .string({ required_error: 'Task title is required' })
    .min(3, 'Title must be at least 3 characters long')
    .max(255, 'Title cannot exceed 255 characters')
    .trim(),
  description: z.string().trim().max(5000, 'Description cannot exceed 5000 characters').optional().nullable(),
  category: z
    .enum(ALL_TASK_CATEGORIES as [TaskCategory, ...TaskCategory[]])
    .optional()
    .default('Teaching'),
  priority: z.enum(ALL_TASK_PRIORITIES as [TaskPriority, ...TaskPriority[]]).default('Medium'),
  dueDate: z
    .string({ required_error: 'Due date is required' })
    .refine(isValidDateString, {
      message: 'Due date must be a valid date in YYYY-MM-DD format',
    }),
  assigneeId: z.coerce
    .number({ required_error: 'Assignee ID is required' })
    .int('Assignee ID must be an integer')
    .positive('Assignee ID must be positive'),
});

export const updateTaskSchema = z.object({
  title: z.string().min(3).max(255).trim().optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  priority: z.enum(ALL_TASK_PRIORITIES as [string, ...string[]]).optional(),
  dueDate: z
    .string()
    .refine(isValidDateString, {
      message: 'Due date must be a valid date in YYYY-MM-DD format',
    })
    .optional(),
});

export const reassignTaskSchema = z.object({
  assigneeId: z.coerce
    .number({ required_error: 'New assignee ID is required' })
    .int()
    .positive(),
});

export const updateTaskStatusSchema = z.object({
  status: z.enum(ALL_TASK_STATUSES as [string, ...string[]], {
    required_error: 'Valid status (Pending, In Progress, Completed) is required',
  }),
});

export const listTasksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(ALL_TASK_STATUSES as [string, ...string[]]).optional(),
  category: z.enum(ALL_TASK_CATEGORIES as [string, ...string[]]).optional(),
  priority: z.enum(ALL_TASK_PRIORITIES as [string, ...string[]]).optional(),
  assigneeId: z.coerce.number().int().positive().optional(),
  view: z.enum(['all', 'assigned_to_me', 'created_by_me']).optional(),
  search: z.string().trim().optional(),
});
