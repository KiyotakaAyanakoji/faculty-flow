import { Router } from 'express';
import {
  createHandover,
  listHandovers,
  getHandoverById,
  updateHandoverStatus,
  deleteHandover,
} from '../controllers/handover.controller.js';
import { authenticateToken } from '../middleware/auth.js';

export const handoverRouter = Router();

handoverRouter.use(authenticateToken);

handoverRouter.post('/', createHandover);
handoverRouter.get('/', listHandovers);
handoverRouter.get('/:id', getHandoverById);
handoverRouter.patch('/:id/status', updateHandoverStatus);
handoverRouter.delete('/:id', deleteHandover);
