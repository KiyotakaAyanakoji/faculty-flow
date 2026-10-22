import mysql from 'mysql2/promise';
import { env } from './env.js';

export interface DbConnectionStatus {
  isConnected: boolean;
  message: string;
  error?: string;
  database?: string;
}

// Create MySQL connection pool
export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: env.DB_CONNECTION_LIMIT,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

/**
 * Test MySQL database connection
 */
export async function testDatabaseConnection(): Promise<DbConnectionStatus> {
  try {
    const connection = await pool.getConnection();
    try {
      await connection.query('SELECT 1 AS test');
      return {
        isConnected: true,
        message: 'Database connection successful',
        database: env.DB_NAME,
      };
    } finally {
      connection.release();
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown database error';
    return {
      isConnected: false,
      message: 'Failed to connect to MySQL database',
      error: errorMessage,
      database: env.DB_NAME,
    };
  }
}
