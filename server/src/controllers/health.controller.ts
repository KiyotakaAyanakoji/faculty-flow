import { Request, Response, NextFunction } from 'express';
import { testDatabaseConnection } from '../config/database.js';
import { env } from '../config/env.js';

export async function getHealthStatus(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dbStatus = await testDatabaseConnection();

    const healthData = {
      status: dbStatus.isConnected ? 'ok' : 'degraded',
      service: 'Faculty Flow 2.0 API',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
      database: {
        status: dbStatus.isConnected ? 'connected' : 'disconnected',
        message: dbStatus.message,
        ...(dbStatus.error && { error: dbStatus.error }),
      },
    };

    res.status(200).json(healthData);
  } catch (error) {
    next(error);
  }
}
