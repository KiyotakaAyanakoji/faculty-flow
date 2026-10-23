import { z } from 'zod';

export const createPersonalEventSchema = z
  .object({
    title: z
      .string({ required_error: 'Event title is required' })
      .trim()
      .min(1, 'Event title is required')
      .max(255, 'Event title must not exceed 255 characters'),
    eventDate: z
      .string({ required_error: 'Event date is required' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Event date must be in YYYY-MM-DD format'),
    startTime: z
      .string({ required_error: 'Start time is required' })
      .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Start time must be in HH:mm format'),
    endTime: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'End time must be in HH:mm format')
      .nullable()
      .optional()
      .or(z.literal('')),
    description: z
      .string()
      .trim()
      .max(2000, 'Description cannot exceed 2000 characters')
      .nullable()
      .optional()
      .or(z.literal('')),
  })
  .refine(
    data => {
      if (data.startTime && data.endTime && data.endTime.trim() !== '') {
        return data.endTime >= data.startTime;
      }
      return true;
    },
    {
      message: 'End time cannot be earlier than start time',
      path: ['endTime'],
    }
  );

export const updatePersonalEventSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Event title is required')
      .max(255, 'Event title must not exceed 255 characters')
      .optional(),
    eventDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Event date must be in YYYY-MM-DD format')
      .optional(),
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Start time must be in HH:mm format')
      .optional(),
    endTime: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'End time must be in HH:mm format')
      .nullable()
      .optional()
      .or(z.literal('')),
    description: z
      .string()
      .trim()
      .max(2000, 'Description cannot exceed 2000 characters')
      .nullable()
      .optional()
      .or(z.literal('')),
  })
  .refine(
    data => {
      if (data.startTime && data.endTime && data.endTime.trim() !== '') {
        return data.endTime >= data.startTime;
      }
      return true;
    },
    {
      message: 'End time cannot be earlier than start time',
      path: ['endTime'],
    }
  );

export const personalEventQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
