import { Router } from 'express';
import {
  createSyllabus,
  listSyllabuses,
  getSyllabusById,
  updateSyllabus,
  updateSyllabusProgress,
  deleteSyllabus,
} from '../controllers/syllabus.controller.js';
import { authenticateToken } from '../middleware/auth.js';

export const syllabusRouter = Router();

syllabusRouter.use(authenticateToken);

syllabusRouter.post('/', createSyllabus);
syllabusRouter.get('/', listSyllabuses);
syllabusRouter.get('/:id', getSyllabusById);
syllabusRouter.patch('/:id', updateSyllabus);
syllabusRouter.patch('/:id/progress', updateSyllabusProgress);
syllabusRouter.delete('/:id', deleteSyllabus);
