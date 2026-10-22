import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from server directory or root
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('faculty_flow_db'),
  DB_CONNECTION_LIMIT: z.coerce.number().default(10),
  JWT_SECRET: z.string().default('faculty_flow_default_dev_secret_change_in_production'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  COOKIE_SECRET: z.string().default('faculty_flow_cookie_secret_dev'),

  // Phase 7: Email Notifications & SMTP Configuration
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
}).refine(data => {
  if (data.EMAIL_ENABLED) {
    return data.SMTP_HOST.trim().length > 0;
  }
  return true;
}, {
  message: 'SMTP_HOST must be provided and non-empty when EMAIL_ENABLED is true',
  path: ['SMTP_HOST'],
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
export type Env = typeof env;
