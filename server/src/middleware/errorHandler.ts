import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;

  constructor(message: string, statusCode = 500, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = 'statusCode' in err && typeof err.statusCode === 'number' 
    ? err.statusCode 
    : 500;

  const isOperational = 'isOperational' in err ? err.isOperational : false;
  const errorCode = 'code' in err ? (err.code as string) : undefined;

  const responsePayload: {
    success: false;
    error: {
      message: string;
      code?: string;
      stack?: string;
    };
  } = {
    success: false,
    error: {
      message: isOperational || env.NODE_ENV !== 'production' 
        ? err.message 
        : 'Internal Server Error',
      ...(errorCode && { code: errorCode }),
      ...(env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  };

  if (statusCode >= 500) {
    console.error(`[Unhandled Error] ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(statusCode).json(responsePayload);
}
