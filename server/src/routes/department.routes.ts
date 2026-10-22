import { Router } from 'express';
import {
  listDepartments,
  createDepartment,
  getDepartmentById,
  getDepartmentFaculty,
} from '../controllers/department.controller.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { ROLES } from '../constants/roles.js';

export const departmentRouter = Router();

departmentRouter.use(authenticateToken);

departmentRouter.get('/', listDepartments);
departmentRouter.post('/', requireRole(ROLES.SYSTEM_ADMIN), createDepartment);
departmentRouter.get('/:id', getDepartmentById);
departmentRouter.get('/:id/faculty', getDepartmentFaculty);
