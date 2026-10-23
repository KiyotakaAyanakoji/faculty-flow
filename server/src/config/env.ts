import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from server directory or root
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

// Helper to parse database connection from Railway MySQL or standard environment variables
function getInitialDbConfig() {
  const connectionUrl = process.env.MYSQL_URL || process.env.DATABASE_URL;
  let urlHost = '';
  let urlPort = '';
  let urlUser = '';
  let urlPass = '';
  let urlDb = '';

  if (connectionUrl) {
    try {
      const parsed = new URL(connectionUrl);
      urlHost = parsed.hostname;
      urlPort = parsed.port;
      urlUser = decodeURIComponent(parsed.username);
      urlPass = decodeURIComponent(parsed.password);
      urlDb = parsed.pathname ? parsed.pathname.replace(/^\//, '') : '';
    } catch {
      // Fall back to discrete variables if URL parse fails
    }
  }

  return {
    host: process.env.DB_HOST || process.env.MYSQLHOST || urlHost || 'localhost',
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || urlPort) || 3306,
    user: process.env.DB_USER || process.env.MYSQLUSER || urlUser || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || urlPass || '',
    name: process.env.DB_NAME || process.env.MYSQLDATABASE || urlDb || 'faculty_flow_db',
  };
}

const defaultDb = getInitialDbConfig();

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  ALLOWED_ORIGINS: z.string().optional(),
  ALLOW_VERCEL_PREVIEWS: z
    .preprocess(val => {
      if (typeof val === 'string') {
        const lower = val.trim().toLowerCase();
        return lower === 'true' || lower === '1';
      }
      return Boolean(val);
    }, z.boolean())
    .default(false),
  VERCEL_PREVIEW_DOMAIN_PATTERN: z.string().optional(),
  DB_HOST: z.string().default(defaultDb.host),
  DB_PORT: z.coerce.number().default(defaultDb.port),
  DB_USER: z.string().default(defaultDb.user),
  DB_PASSWORD: z.string().default(defaultDb.password),
  DB_NAME: z.string().default(defaultDb.name),
  DB_CONNECTION_LIMIT: z.coerce.number().default(10),
  JWT_SECRET: z.string().default('faculty_flow_default_dev_secret_change_in_production'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  COOKIE_SECRET: z.string().default('faculty_flow_cookie_secret_dev'),
  COOKIE_SAME_SITE: z.enum(['lax', 'none', 'strict']).default('lax'),

  // Phase 5 & 9: Persistent Storage Configuration
  EVENT_UPLOAD_DIR: z.string().optional(),

  // Phase 7: Email Notifications & SMTP Configuration
  RUN_NOTIFICATION_WORKER: z
    .preprocess(val => {
      if (typeof val === 'string') {
        const lower = val.trim().toLowerCase();
        return lower === 'true' || lower === '1';
      }
      return Boolean(val);
    }, z.boolean())
    .default(true),
  EMAIL_ENABLED: z
    .preprocess(val => {
      if (typeof val === 'string') {
        const lower = val.trim().toLowerCase();
        return lower === 'true' || lower === '1';
      }
      return Boolean(val);
    }, z.boolean())
    .default(false),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .preprocess(val => {
      if (typeof val === 'string') {
        const lower = val.trim().toLowerCase();
        return lower === 'true' || lower === '1';
      }
      return Boolean(val);
    }, z.boolean())
    .default(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('Faculty Flow <noreply@facultyflow.local>'),
})
  .refine(data => {
    if (data.EMAIL_ENABLED) {
      return data.SMTP_HOST.trim().length > 0;
    }
    return true;
  }, {
    message: 'SMTP_HOST must be provided and non-empty when EMAIL_ENABLED is true',
    path: ['SMTP_HOST'],
  })
  .refine(data => {
    if (data.NODE_ENV === 'production') {
      if (
        data.JWT_SECRET === 'faculty_flow_default_dev_secret_change_in_production' ||
        data.JWT_SECRET.length < 32
      ) {
        return false;
      }
    }
    return true;
  }, {
    message: 'In production (NODE_ENV=production), JWT_SECRET must be securely set and at least 32 characters long.',
    path: ['JWT_SECRET'],
  })
  .refine(data => {
    if (data.NODE_ENV === 'production') {
      if (
        data.COOKIE_SECRET === 'faculty_flow_cookie_secret_dev' ||
        data.COOKIE_SECRET.length < 32
      ) {
        return false;
      }
    }
    return true;
  }, {
    message: 'In production (NODE_ENV=production), COOKIE_SECRET must be securely set and at least 32 characters long.',
    path: ['COOKIE_SECRET'],
  });

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
export type Env = typeof env;
