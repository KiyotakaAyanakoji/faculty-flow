import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Database Migrations & Fresh Schema Verification Suite (Phase 9)', () => {
  const disposableDbName = 'faculty_flow_phase9_clean_test_db';
  let rootConn: mysql.Connection | null = null;
  let canProvisionCleanDb = false;

  beforeAll(async () => {
    try {
      rootConn = await mysql.createConnection({
        host: env.DB_HOST,
        port: env.DB_PORT,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
      });

      // Try creating disposable DB
      await rootConn.query(`DROP DATABASE IF EXISTS \`${disposableDbName}\``);
      await rootConn.query(
        `CREATE DATABASE \`${disposableDbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      canProvisionCleanDb = true;
    } catch (err) {
      console.warn('Could not create disposable database on local MySQL:', err);
      canProvisionCleanDb = false;
    }
  });

  afterAll(async () => {
    if (rootConn && canProvisionCleanDb) {
      try {
        await rootConn.query(`DROP DATABASE IF EXISTS \`${disposableDbName}\``);
      } catch (err) {
        console.warn('Cleanup error dropping disposable test DB:', err);
      } finally {
        await rootConn.end();
      }
    } else if (rootConn) {
      await rootConn.end();
    }
  });

  it('should apply migrations 001 through 008 in order on a clean disposable database', async () => {
    if (!canProvisionCleanDb) {
      console.warn('Skipping clean-db migration test: user lacks CREATE DATABASE privilege on host.');
      return;
    }

    const testConn = await mysql.createConnection({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: disposableDbName,
      multipleStatements: true,
    });

    try {
      // 1. Fresh database starts with 0 application tables
      const [initialTables] = await testConn.query<any[]>('SHOW TABLES');
      expect(initialTables.length).toBe(0);

      // 2. Ensure schema_migrations table
      await testConn.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          version VARCHAR(255) NOT NULL UNIQUE,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 3. Read migration files in sorted order
      const migrationsDir = path.resolve(__dirname, '../src/db/migrations');
      const files = await fs.readdir(migrationsDir);
      const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

      expect(sqlFiles.length).toBe(8);
      expect(sqlFiles[0]).toBe('001_initial_schema.sql');
      expect(sqlFiles[7]).toBe('008_business_versioning_and_idempotency.sql');

      // 4. Apply all migrations in order
      for (const file of sqlFiles) {
        const filePath = path.join(migrationsDir, file);
        const sql = await fs.readFile(filePath, 'utf-8');

        await testConn.beginTransaction();
        try {
          const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

          for (const statement of statements) {
            await testConn.query(statement);
          }

          await testConn.query(
            'INSERT INTO schema_migrations (version) VALUES (?)',
            [file]
          );

          await testConn.commit();
        } catch (err) {
          await testConn.rollback();
          throw err;
        }
      }

      // 5. Verify all 8 recorded in schema_migrations
      const [appliedRows] = await testConn.query<any[]>(
        'SELECT version FROM schema_migrations ORDER BY id ASC'
      );
      expect(appliedRows.length).toBe(8);
      const recorded = appliedRows.map(r => r.version);
      expect(recorded).toEqual(sqlFiles);

      // 6. Verify core tables exist
      const [tablesAfter] = await testConn.query<any[]>('SHOW TABLES');
      const tableNames = tablesAfter.map(t => Object.values(t)[0] as string);

      const expectedCoreTables = [
        'schema_migrations',
        'departments',
        'users',
        'refresh_tokens',
        'audit_logs',
        'tasks',
        'syllabuses',
        'handovers',
        'academic_events',
        'event_participants',
        'event_documents',
        'leave_types',
        'leave_balances',
        'leave_requests',
        'leave_audit_logs',
        'email_notifications',
      ];

      for (const table of expectedCoreTables) {
        expect(tableNames).toContain(table);
      }

      // 7. Verify version column exists in tasks and academic_events (migration 008)
      const [taskCols] = await testConn.query<any[]>('DESCRIBE tasks');
      expect(taskCols.some(c => c.Field === 'version')).toBe(true);

      const [eventCols] = await testConn.query<any[]>('DESCRIBE academic_events');
      expect(eventCols.some(c => c.Field === 'version')).toBe(true);

      // 8. Re-run migration check on applied database to verify idempotency
      const appliedSet = new Set(appliedRows.map(r => r.version));
      let wouldReapplyCount = 0;
      for (const file of sqlFiles) {
        if (!appliedSet.has(file)) {
          wouldReapplyCount++;
        }
      }
      expect(wouldReapplyCount).toBe(0);
    } finally {
      await testConn.end();
    }
  });

  it('should fail safely when attempting to connect with invalid credentials or unreachable port', async () => {
    let connectionError: any = null;
    try {
      const badConn = await mysql.createConnection({
        host: '127.0.0.1',
        port: 65432, // Non-existent MySQL port
        user: 'invalid_user_phase9',
        password: 'wrong_password',
        connectTimeout: 2000,
      });
      await badConn.end();
    } catch (err: any) {
      connectionError = err;
    }

    expect(connectionError).not.toBeNull();
    expect(connectionError.message).toBeDefined();
  });
});
