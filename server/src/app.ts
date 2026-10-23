import express, { Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { healthRouter } from './routes/health.routes.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(): Express {
  const app = express();

  // Security Headers Middleware
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Resolve configured origins
  const configuredOrigins = [
    ...env.CLIENT_URL.split(',').map(s => s.trim()).filter(Boolean),
    ...(env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) : [])
  ];

  if (env.NODE_ENV !== 'production') {
    if (!configuredOrigins.includes('http://localhost:5173')) configuredOrigins.push('http://localhost:5173');
    if (!configuredOrigins.includes('http://127.0.0.1:5173')) configuredOrigins.push('http://127.0.0.1:5173');
    if (!configuredOrigins.includes('http://localhost:3000')) configuredOrigins.push('http://localhost:3000');
  }

  // Compile Vercel preview domain pattern if enabled
  const previewRegex = env.ALLOW_VERCEL_PREVIEWS
    ? (env.VERCEL_PREVIEW_DOMAIN_PATTERN
        ? new RegExp(env.VERCEL_PREVIEW_DOMAIN_PATTERN)
        : /^https:\/\/([a-z0-9-]+-)*faculty-flow.*\.vercel\.app$/)
    : null;

  const isOriginAllowed = (origin: string | undefined): boolean => {
    // Allow non-browser requests (e.g., server-side health checks, curl, Postman)
    if (!origin) return true;
    if (configuredOrigins.includes(origin)) return true;
    if (previewRegex && previewRegex.test(origin)) return true;
    return false;
  };

  // CORS configuration
  app.use(
    cors({
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Idempotency-Key'],
    })
  );

  // Cookie parser
  app.use(cookieParser(env.COOKIE_SECRET));

  // Body parsers with bounded payload limits
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Root health endpoint alias
  app.use('/health', healthRouter);

  // API router
  app.use('/api', apiRouter);

  // 404 Handler
  app.use(notFoundHandler);

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
