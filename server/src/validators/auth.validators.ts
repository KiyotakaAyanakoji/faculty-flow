import { z } from 'zod';
import { ALL_ROLES, ALL_TASK_CATEGORIES, ROLES } from '../constants/roles.js';

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address')
    .transform(val => val.trim().toLowerCase()),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password cannot be empty'),
});

export const changePasswordSchema = z.object({
  currentPassword: z
    .string({ required_error: 'Current password is required' })
    .min(1, 'Current password is required'),
  newPassword: z
    .string({ required_error: 'New password is required' })
    .min(8, 'New password must be at least 8 characters long'),
});

export const createUserSchema = z
  .object({
    email: z
      .string({ required_error: 'Email is required' })
      .email('Invalid email address')
      .transform(val => val.trim().toLowerCase()),
    password: z
      .string({ required_error: 'Password is required' })
      .min(8, 'Password must be at least 8 characters long'),
    fullName: z
      .string({ required_error: 'Full name is required' })
      .min(2, 'Full name must have at least 2 characters')
      .trim(),
    role: z.enum(ALL_ROLES as [string, ...string[]], {
      required_error: 'Role is required',
    }),
    departmentId: z.coerce.number().nullable().optional(),
    canAssignWork: z.boolean().optional().default(false),
  })
  .refine(
    data => {
      // If role is NOT System Admin, departmentId is required
      if (data.role !== ROLES.SYSTEM_ADMIN && !data.departmentId) {
        return false;
      }
      return true;
    },
    {
      message: 'Faculty roles (HOD, Professor, Assistant Professor) must be assigned to a department.',
      path: ['departmentId'],
    }
  );

export const updateUserSchema = z.object({
  fullName: z.string().min(2).trim().optional(),
  role: z.enum(ALL_ROLES as [string, ...string[]]).optional(),
  departmentId: z.coerce.number().nullable().optional(),
  canAssignWork: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const createDepartmentSchema = z.object({
  code: z
    .string({ required_error: 'Department code is required' })
    .min(2, 'Code must have at least 2 characters')
    .max(10, 'Code cannot exceed 10 characters')
    .transform(val => val.trim().toUpperCase()),
  name: z
    .string({ required_error: 'Department name is required' })
    .min(3, 'Department name must have at least 3 characters')
    .max(100, 'Department name cannot exceed 100 characters')
    .trim(),
  description: z.string().trim().optional(),
});

export const checkAllocationSchema = z.object({
  targetUserId: z.coerce.number({ required_error: 'Target user ID is required' }),
  category: z.enum(ALL_TASK_CATEGORIES as [string, ...string[]]).optional(),
});
