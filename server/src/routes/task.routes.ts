import { Router } from 'express';
import { evaluateTaskAllocation } from '../controllers/task-policy.controller.js';
import { authenticateToken } from '../middleware/auth.js';

export const taskRouter = Router();

taskRouter.use(authenticateToken);

taskRouter.post('/evaluate-allocation', evaluateTaskAllocation);
