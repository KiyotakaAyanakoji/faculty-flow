import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { pool, testDatabaseConnection } from '../config/database.js';
import { ROLES } from '../constants/roles.js';
import { env } from '../config/env.js';

export async function seedDatabase(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Execution blocked: Development database seeding is strictly prohibited in production mode (NODE_ENV=production). ' +
      'Production environments must provision real administrative accounts securely.'
    );
  }

  console.log('--- Starting Safe Development Seeding ---');

  const status = await testDatabaseConnection();
  if (!status.isConnected) {
    console.error('Cannot seed: Database is not connected.');
    process.exit(1);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Seed Departments
    console.log('Seeding departments...');
    await connection.query(`
      INSERT INTO departments (code, name, description)
      VALUES 
        ('CS', 'Computer Science & Engineering', 'Department of Computer Science and Engineering'),
        ('MECH', 'Mechanical Engineering', 'Department of Mechanical Engineering')
      ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)
    `);

    // Fetch department IDs
    const [deptRows] = await connection.query<any[]>('SELECT id, code FROM departments');
    const deptMap: Record<string, number> = {};
    for (const d of deptRows) {
      deptMap[d.code] = d.id;
    }

    // 2. Seed Users
    console.log('Seeding baseline test roles...');
    const defaultPassword = 'Password@12345';
    const passwordHash = await bcrypt.hash(defaultPassword, 12);

    const testUsers = [
      {
        email: 'admin@facultyflow.local',
        fullName: 'Dr. Arthur Vance (System Admin)',
        role: ROLES.SYSTEM_ADMIN,
        departmentId: null,
        canAssignWork: false,
        isActive: true,
      },
      {
        email: 'hod.cs@facultyflow.local',
        fullName: 'Prof. Alan Turing (HOD CS)',
        role: ROLES.HOD,
        departmentId: deptMap['CS'],
        canAssignWork: true,
        isActive: true,
      },
      {
        email: 'prof.cs@facultyflow.local',
        fullName: 'Dr. Ada Lovelace (Professor CS)',
        role: ROLES.PROFESSOR,
        departmentId: deptMap['CS'],
        canAssignWork: true,
        isActive: true,
      },
      {
        email: 'asst.cs@facultyflow.local',
        fullName: 'Claude Shannon (Assistant Professor CS)',
        role: ROLES.ASSISTANT_PROFESSOR,
        departmentId: deptMap['CS'],
        canAssignWork: false, // Default: cannot allocate
        isActive: true,
      },
      {
        email: 'asst.lead.cs@facultyflow.local',
        fullName: 'Grace Hopper (Lead Assistant Professor CS)',
        role: ROLES.ASSISTANT_PROFESSOR,
        departmentId: deptMap['CS'],
        canAssignWork: true, // Explicit delegation permission
        isActive: true,
      },
      {
        email: 'hod.mech@facultyflow.local',
        fullName: 'Prof. James Watt (HOD MECH)',
        role: ROLES.HOD,
        departmentId: deptMap['MECH'],
        canAssignWork: true,
        isActive: true,
      },
      {
        email: 'prof.mech@facultyflow.local',
        fullName: 'Dr. Nikola Tesla (Professor MECH)',
        role: ROLES.PROFESSOR,
        departmentId: deptMap['MECH'],
        canAssignWork: true,
        isActive: true,
      },
      {
        email: 'inactive@facultyflow.local',
        fullName: 'Former Faculty Member (Inactive)',
        role: ROLES.ASSISTANT_PROFESSOR,
        departmentId: deptMap['CS'],
        canAssignWork: false,
        isActive: false, // Deactivated account
      },
    ];

    for (const user of testUsers) {
      await connection.query(
        `INSERT INTO users (email, password_hash, full_name, role, department_id, can_assign_work, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           full_name = VALUES(full_name),
           role = VALUES(role),
           department_id = VALUES(department_id),
           can_assign_work = VALUES(can_assign_work),
           is_active = VALUES(is_active)`,
        [
          user.email,
          passwordHash,
          user.fullName,
          user.role,
          user.departmentId,
          user.canAssignWork ? 1 : 0,
          user.isActive ? 1 : 0,
        ]
      );
    }

    // 3. Seed Initial Leave Balances for academic year 2026-2027
    console.log('Seeding leave balances for academic year 2026-2027...');
    const [allUsers] = await connection.query<any[]>('SELECT id, role FROM users WHERE is_active = 1');
    const [leaveTypes] = await connection.query<any[]>('SELECT id, default_days_per_year FROM leave_types');

    for (const u of allUsers) {
      if (u.role === ROLES.SYSTEM_ADMIN) continue;
      for (const lt of leaveTypes) {
        await connection.query(
          `INSERT INTO leave_balances (user_id, leave_type_id, academic_year, entitled_days, used_days, pending_days)
           VALUES (?, ?, '2026-2027', ?, 0.0, 0.0)
           ON DUPLICATE KEY UPDATE entitled_days = VALUES(entitled_days), used_days = 0.0, pending_days = 0.0`,
          [u.id, lt.id, lt.default_days_per_year]
        );
      }
    }

    await connection.commit();
    console.log('Seeding completed successfully.');
    console.log('All test accounts use password: Password@12345');
  } catch (error) {
    await connection.rollback();
    console.error('Seeding transaction failed:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Allow direct CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase()
    .then(() => {
      console.log('Seed command completed.');
      process.exit(0);
    })
    .catch(err => {
      console.error('Seed command failed:', err);
      process.exit(1);
    });
}
