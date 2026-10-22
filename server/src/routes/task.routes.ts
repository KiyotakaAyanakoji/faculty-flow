import { Router } from 'express';
import {
  createTask,
  listTasks,
  getTaskById,
  updateTask,
  reassignTask,
  updateTaskStatus,
  deleteTask,
  getTaskSummary,
  getEligibleAssignees,
} from '../controllers/task.controller.js';
import { evaluateTaskAllocation } from '../controllers/task-policy.controller.js';
import { authenticateToken } from '../middleware/auth.js';

export const taskRouter = Router();

taskRouter.use(authenticateToken);

// Task collection & utility endpoints
taskRouter.post('/', createTask);
taskRouter.get('/', listTasks);
taskRouter.get('/summary', getTaskSummary);
taskRouter.get('/eligible-assignees', getEligibleAssignees);
taskRouter.post('/evaluate-allocation', evaluateTaskAllocation); // Phase 2 preservation

// Single task resource endpoints
taskRouter.get('/:id', getTaskById);
taskRouter.patch('/:id', updateTask);
taskRouter.patch('/:id/assign', reassignTask);
taskRouter.patch('/:id/status', updateTaskStatus);
taskRouter.delete('/:id', deleteTask);
