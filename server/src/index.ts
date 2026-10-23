import { app } from './app.js';
import { env } from './config/env.js';
import { testDatabaseConnection, pool } from './config/database.js';
import { notificationWorker } from './services/email/index.js';

const PORT = env.PORT;

const server = app.listen(PORT, async () => {
  console.log(`========================================`);
  console.log(` Faculty Flow 2.0 Backend Server Running`);
  console.log(` Environment : ${env.NODE_ENV}`);
  console.log(` Port        : ${PORT}`);
  console.log(` Health API  : http://localhost:${PORT}/api/health`);
  console.log(` Client URL  : ${env.CLIENT_URL}`);
  console.log(` Email Mode  : ${env.EMAIL_ENABLED ? 'SMTP Active' : 'Dev / Disabled'}`);
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

  // Start background notification queue worker if enabled
  if (env.NODE_ENV !== 'test' && env.RUN_NOTIFICATION_WORKER) {
    notificationWorker.start();
    console.log('Notification queue worker started.');
  } else if (!env.RUN_NOTIFICATION_WORKER) {
    console.log('Notification queue worker disabled on this API instance (RUN_NOTIFICATION_WORKER=false).');
  }
});

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  
  // Stop notification worker first
  try {
    await notificationWorker.stop();
    console.log('Notification queue worker stopped.');
  } catch (workerErr) {
    console.error('Error stopping notification worker:', workerErr);
  }

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
