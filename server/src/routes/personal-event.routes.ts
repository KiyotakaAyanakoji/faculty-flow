import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  listPersonalEvents,
  getPersonalEventById,
  createPersonalEvent,
  updatePersonalEvent,
  deletePersonalEvent,
} from '../controllers/personal-event.controller.js';

export const personalEventRouter = Router();

// All personal event operations require authentication
personalEventRouter.use(authenticateToken);

personalEventRouter.get('/', listPersonalEvents);
personalEventRouter.get('/:id', getPersonalEventById);
personalEventRouter.post('/', createPersonalEvent);
personalEventRouter.patch('/:id', updatePersonalEvent);
personalEventRouter.delete('/:id', deletePersonalEvent);
