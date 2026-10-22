import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { handlePdfUpload } from '../middleware/upload.middleware.js';
import {
  listEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  uploadEventDocument,
  downloadEventDocument,
  deleteEventDocument,
  getEligibleParticipants,
} from '../controllers/event.controller.js';

export const eventRouter = Router();

// All event operations require authentication
eventRouter.use(authenticateToken);

// Event collection & participant endpoints
eventRouter.get('/', listEvents);
eventRouter.get('/eligible-participants', getEligibleParticipants);
eventRouter.post('/', createEvent);

// Single event operations
eventRouter.get('/:id', getEventById);
eventRouter.patch('/:id', updateEvent);
eventRouter.delete('/:id', deleteEvent);

// Secure PDF Document attachment endpoints
eventRouter.post('/:id/documents', handlePdfUpload, uploadEventDocument);
eventRouter.get('/:id/documents/:docId/download', downloadEventDocument);
eventRouter.delete('/:id/documents/:docId', deleteEventDocument);
