import { app } from './app.js';
import { env } from './config/env.js';
import { testDatabaseConnection, pool } from './config/database.js';

const PORT = env.PORT;

const server = app.listen(PORT, async () => {
  console.log(`========================================`);
  console.log(` Faculty Flow 2.0 Backend Server Running`);
  console.log(` Environment : ${env.NODE_ENV}`);
  console.log(` Port        : ${PORT}`);
  console.log(` Health API  : http://localhost:${PORT}/api/health`);
  console.log(` Client URL  : ${env.CLIENT_URL}`);
  console.log(`========================================`);

  // Verify database connectivity on boot
  console.log('Testing MySQL connection...');
  const dbStatus = await testDatabaseConnection();
  if (dbStatus.isConnected) {
    console.log(`MySQL connected successfully: [${dbStatus.database}]`);
  } else {
    console.warn(`MySQL connection notice: ${dbStatus.message}`);
    if (dbStatus.error) {
      console.warn(`Details: ${dbStatus.error}`);
    }
    console.warn('Note: Database can be started anytime without restarting the server.');
  }
});

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await pool.end();
      console.log('Database connection pool closed.');
    } catch (err) {
      console.error('Error closing database pool:', err);
    }
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
