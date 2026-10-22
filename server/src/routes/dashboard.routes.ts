import { Router } from 'express';
import { getDashboard } from '../controllers/dashboard.controller.js';
import { authenticateToken } from '../middleware/auth.js';

export const dashboardRouter = Router();

dashboardRouter.use(authenticateToken);

dashboardRouter.get('/', getDashboard);
