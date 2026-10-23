import { Router } from 'express';
import {
  login,
  logout,
  refresh,
  getMe,
  changePassword,
} from '../controllers/auth.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { loginRateLimiter, changePasswordRateLimiter } from '../middleware/rateLimiter.js';

export const authRouter = Router();

authRouter.post('/login', loginRateLimiter, login);
authRouter.post('/logout', logout);
authRouter.post('/refresh', refresh);
authRouter.get('/me', authenticateToken, getMe);
authRouter.post('/change-password', authenticateToken, changePasswordRateLimiter, changePassword);
