import { Router } from 'express';
import {
  listUsers,
  createUser,
  getUserById,
  updateUser,
} from '../controllers/user.controller.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { ROLES } from '../constants/roles.js';

export const userRouter = Router();

userRouter.use(authenticateToken);

userRouter.get('/', listUsers);
userRouter.post('/', requireRole(ROLES.SYSTEM_ADMIN), createUser);
userRouter.get('/:id', getUserById);
userRouter.patch('/:id', updateUser);
