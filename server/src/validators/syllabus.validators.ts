import { z } from 'zod';
import { ALL_SYLLABUS_STATUSES, SyllabusStatus } from '../constants/roles.js';

export const unitSchema = z.object({
  unitNumber: z.number().int().positive(),
  title: z.string().min(1).max(255).trim(),
  hours: z.number().int().nonnegative().optional(),
  status: z.enum(['Pending', 'In Progress', 'Completed']).default('Pending'),
});

export const createSyllabusSchema = z.object({
  courseCode: z
    .string({ required_error: 'Course code is required' })
    .min(2, 'Course code must be at least 2 characters')
    .max(50, 'Course code cannot exceed 50 characters')
    .trim(),
  courseName: z
    .string({ required_error: 'Course name is required' })
    .min(3, 'Course name must be at least 3 characters')
    .max(200, 'Course name cannot exceed 200 characters')
    .trim(),
  academicYear: z
    .string({ required_error: 'Academic year is required' })
    .min(4, 'Academic year must be specified (e.g. 2026-2027)')
    .max(20)
    .trim(),
  semester: z
    .string({ required_error: 'Semester is required' })
    .min(1, 'Semester is required')
    .max(30)
    .trim(),
  totalUnits: z.coerce.number().int().min(1, 'Course must have at least 1 unit').max(20).default(5),
  facultyId: z.coerce.number().int().positive().optional().nullable(),
  units: z.array(unitSchema).optional(),
});

export const updateSyllabusSchema = z.object({
  courseName: z.string().min(3).max(200).trim().optional(),
  academicYear: z.string().min(4).max(20).trim().optional(),
  semester: z.string().min(1).max(30).trim().optional(),
  totalUnits: z.coerce.number().int().min(1).max(20).optional(),
  facultyId: z.coerce.number().int().positive().nullable().optional(),
  status: z.enum(ALL_SYLLABUS_STATUSES as [SyllabusStatus, ...SyllabusStatus[]]).optional(),
});

export const updateSyllabusProgressSchema = z.object({
  completedUnits: z.coerce.number().int().min(0, 'Completed units cannot be negative'),
  status: z.enum(ALL_SYLLABUS_STATUSES as [SyllabusStatus, ...SyllabusStatus[]]).optional(),
  units: z.array(unitSchema).optional(),
});

export const listSyllabusQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(ALL_SYLLABUS_STATUSES as [SyllabusStatus, ...SyllabusStatus[]]).optional(),
  facultyId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().optional(),
});
