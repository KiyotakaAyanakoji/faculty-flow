import { z } from 'zod';
import { ALL_EVENT_CATEGORIES } from '../constants/roles.js';

export const createEventSchema = z
  .object({
    title: z
      .string({ required_error: 'Event title is required' })
      .trim()
      .min(3, 'Event title must be at least 3 characters')
      .max(255, 'Event title must not exceed 255 characters'),
    description: z
      .string()
      .trim()
      .max(2000, 'Description must not exceed 2000 characters')
      .nullable()
      .optional(),
    category: z.enum(ALL_EVENT_CATEGORIES as [string, ...string[]], {
      errorMap: () => ({
        message: `Category must be one of: ${ALL_EVENT_CATEGORIES.join(', ')}`,
      }),
    }),
    startTime: z
      .string({ required_error: 'Start time is required' })
      .refine(val => !isNaN(Date.parse(val)), {
        message: 'Start time must be a valid ISO date-time string',
      }),
    endTime: z
      .string({ required_error: 'End time is required' })
      .refine(val => !isNaN(Date.parse(val)), {
        message: 'End time must be a valid ISO date-time string',
      }),
    isAllDay: z.boolean().optional().default(false),
    location: z
      .string()
      .trim()
      .max(255, 'Location cannot exceed 255 characters')
      .nullable()
      .optional(),
    meetingLink: z
      .string()
      .trim()
      .url('Meeting link must be a valid URL')
      .max(500, 'Meeting link cannot exceed 500 characters')
      .nullable()
      .optional()
      .or(z.literal('')),
    departmentId: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional(),
    participantIds: z
      .array(z.number().int().positive())
      .optional()
      .default([]),
  })
  .refine(
    data => {
      const start = new Date(data.startTime).getTime();
      const end = new Date(data.endTime).getTime();
      return end >= start;
    },
    {
      message: 'End time must not be earlier than start time',
      path: ['endTime'],
    }
  );

export const updateEventSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, 'Event title must be at least 3 characters')
      .max(255, 'Event title must not exceed 255 characters')
      .optional(),
    description: z
      .string()
      .trim()
      .max(2000, 'Description must not exceed 2000 characters')
      .nullable()
      .optional(),
    category: z
      .enum(ALL_EVENT_CATEGORIES as [string, ...string[]], {
        errorMap: () => ({
          message: `Category must be one of: ${ALL_EVENT_CATEGORIES.join(', ')}`,
        }),
      })
      .optional(),
    startTime: z
      .string()
      .refine(val => !isNaN(Date.parse(val)), {
        message: 'Start time must be a valid date-time string',
      })
      .optional(),
    endTime: z
      .string()
      .refine(val => !isNaN(Date.parse(val)), {
        message: 'End time must be a valid date-time string',
      })
      .optional(),
    isAllDay: z.boolean().optional(),
    location: z
      .string()
      .trim()
      .max(255, 'Location cannot exceed 255 characters')
      .nullable()
      .optional(),
    meetingLink: z
      .string()
      .trim()
      .url('Meeting link must be a valid URL')
      .max(500, 'Meeting link cannot exceed 500 characters')
      .nullable()
      .optional()
      .or(z.literal('')),
    participantIds: z
      .array(z.number().int().positive())
      .optional(),
  })
  .refine(
    data => {
      if (data.startTime && data.endTime) {
        const start = new Date(data.startTime).getTime();
        const end = new Date(data.endTime).getTime();
        return end >= start;
      }
      return true;
    },
    {
      message: 'End time must not be earlier than start time',
      path: ['endTime'],
    }
  );

export const eventQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
});
