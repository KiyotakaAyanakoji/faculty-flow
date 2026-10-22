import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, testDatabaseConnection } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
  console.log('--- Starting Database Migration ---');

  const connectionStatus = await testDatabaseConnection();
  if (!connectionStatus.isConnected) {
    console.error(`Cannot run migrations: ${connectionStatus.message}`);
    if (connectionStatus.error) {
      console.error(`Details: ${connectionStatus.error}`);
    }
    process.exit(1);
  }

  const connection = await pool.getConnection();

  try {
    // 1. Ensure migrations table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        version VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Fetch already applied migrations
    const [rows] = await connection.query<any[]>('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(rows.map((r: { version: string }) => r.version));

    // 3. Read migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

    let appliedCount = 0;

    for (const file of sqlFiles) {
      if (!appliedVersions.has(file)) {
        console.log(`Applying migration: ${file}...`);
        const filePath = path.join(migrationsDir, file);
        const sql = await fs.readFile(filePath, 'utf-8');

        await connection.beginTransaction();
        try {
          // Split multiple statements if any
          const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

          for (const statement of statements) {
            await connection.query(statement);
          }

          await connection.query(
            'INSERT INTO schema_migrations (version) VALUES (?)',
            [file]
          );

          await connection.commit();
          console.log(`Applied: ${file}`);
          appliedCount++;
        } catch (error) {
          await connection.rollback();
          console.error(`Failed to apply migration ${file}:`, error);
          throw error;
        }
      }
    }

    if (appliedCount === 0) {
      console.log('All migrations are already up to date.');
    } else {
      console.log(`Successfully applied ${appliedCount} migration(s).`);
    }
  } finally {
    connection.release();
  }
}

// Allow direct CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log('Migration process completed successfully.');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration process failed:', err);
      process.exit(1);
    });
}
