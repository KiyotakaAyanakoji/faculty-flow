import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { listHolidays } from '../controllers/holiday.controller.js';

export const holidayRouter = Router();

holidayRouter.use(authenticateToken);
holidayRouter.get('/', listHolidays);
