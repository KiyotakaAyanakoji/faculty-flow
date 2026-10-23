import { notificationWorker } from './services/email/index.js';
import { testDatabaseConnection, pool } from './config/database.js';
import { env } from './config/env.js';

console.log('========================================');
console.log(' Faculty Flow 2.0 Dedicated Email Worker');
console.log(` Environment : ${env.NODE_ENV}`);
console.log(` Email Mode  : ${env.EMAIL_ENABLED ? 'SMTP Active' : 'Dev / Disabled'}`);
console.log('========================================');

async function main() {
  console.log('Testing database connection for worker...');
  const dbStatus = await testDatabaseConnection();
  if (!dbStatus.isConnected) {
    console.error('Fatal: Cannot connect to MySQL database:', dbStatus.message);
    if (dbStatus.error) {
      console.error('Error details:', dbStatus.error);
    }
    process.exit(1);
  }

  console.log(`MySQL connected for worker: [${dbStatus.database}]`);

  // Start notification worker polling loop
  notificationWorker.start();
  console.log('Dedicated worker polling started successfully.');

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down worker gracefully...`);
    try {
      await notificationWorker.stop();
      console.log('Notification worker stopped.');
    } catch (err) {
      console.error('Error stopping worker:', err);
    }

    try {
      await pool.end();
      console.log('Database connection closed.');
    } catch (err) {
      console.error('Error closing database pool:', err);
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(err => {
  console.error('Worker crashed on initialization:', err);
  process.exit(1);
});
