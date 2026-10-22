# Faculty Flow 2.0

> Modern Academic Operations & Faculty Management System
> **Phase 1: Foundation Layer** • **Phase 2: Authentication & RBAC** • **Phase 3: Task Management & Faculty Assignments**

Faculty Flow 2.0 is an enterprise-grade academic operations platform designed for higher education institutions. This repository features a modular, decoupled full-stack architecture built with React 19 (Vite + TypeScript), Node.js (Express + TypeScript), and MySQL.

---

## 🏗️ Architecture Overview

The codebase is organized as an npm workspaces monorepo:

```text
faculty_flow/
├── client/                     # Frontend Application (React 19 + Vite + TypeScript)
│   ├── src/
│   │   ├── components/         # UI components (TaskManagementView, LoginForm, Navbar, RoleMatrixView, HealthCard, etc.)
│   │   ├── context/            # AuthContext & useAuth session hook
│   │   ├── test/               # Vitest + React Testing Library suites (App, Tasks)
│   │   ├── types/              # Client auth, department, and task type definitions
│   │   ├── App.tsx             # Root authenticated shell and public landing
│   │   ├── App.css             # Vanilla CSS layout and component styling
│   │   ├── index.css           # Design tokens, color system, and resets
│   │   └── main.tsx            # Application entry point
│   ├── .env.example            # Client environment template
│   ├── index.html              # HTML shell with typography and SEO metadata
│   ├── package.json            # Client dependencies and scripts
│   ├── tsconfig.json           # Client TypeScript configuration
│   └── vite.config.ts          # Vite build, proxy, and test config
│
├── server/                     # Backend API Application (Node.js + Express + TypeScript)
│   ├── src/
│   │   ├── config/             # Zod environment validation & MySQL connection pool
│   │   ├── constants/          # Role definitions, RBAC policies, task priorities, statuses
│   │   ├── controllers/        # Task, Auth, User, Department, TaskPolicy, Health controllers
│   │   ├── db/                 # Transactional migration runner, seed script, SQL files
│   │   │   ├── migrations/
│   │   │   │   ├── 001_initial_schema.sql         # Schema migration tracker & system metadata
│   │   │   │   ├── 002_auth_and_rbac.sql          # Departments, Users, Tokens, Audit Logs
│   │   │   │   └── 003_tasks_and_assignments.sql  # Tasks, Assignments, Statuses, Deadlines
│   │   │   ├── migrate.ts                         # Migration runner
│   │   │   └── seed.ts                            # Safe development database seeder
│   │   ├── middleware/         # Auth verification, RBAC guards, rate limiter, error handlers
│   │   ├── routes/             # Modular routers (/health, /auth, /users, /departments, /tasks)
│   │   ├── services/           # JWT & DB-backed refresh token service, audit logging
│   │   ├── types/              # Server user, token, task, and Express typing extensions
│   │   ├── validators/         # Zod schemas for input validation (auth, user, task)
│   │   ├── app.ts              # Express application factory & middleware chain
│   │   └── index.ts            # Server entry point with DB check & graceful shutdown
│   ├── test/                   # Vitest + Supertest backend test suites
│   │   ├── auth.test.ts        # Authentication, password hashing, and cookie tests
│   │   ├── rbac.test.ts        # Role permissions, department isolation, and matrix tests
│   │   ├── tasks.test.ts       # Task management, role permissions, scoping, reassignment
│   │   └── health.test.ts      # Phase 1 health check smoke tests
│   ├── .env.example            # Server environment template
│   ├── package.json            # Server dependencies and scripts
│   └── tsconfig.json           # Server TypeScript configuration
│
├── .env.example                # Root environment template
├── .gitignore                  # Strict Git rules preventing secret and artifact leaks
├── package.json                # Root workspaces orchestrator
└── README.md                   # System documentation and operational runbook
```

---

## 🔐 Authentication & Security Design

### Authentication Approach
- **Access Tokens**: Short-lived JSON Web Tokens (15-minute expiration) containing `{ userId, email, role, departmentId }`.
- **Refresh Tokens**: Cryptographically random 40-byte tokens stored as SHA-256 hashes in the MySQL `refresh_tokens` table (7-day expiration).
- **Transport Security**: Stored in `HttpOnly`, `SameSite=Lax` cookies (and optionally via `Authorization: Bearer` headers for API clients), preventing XSS token exfiltration.
- **Token Rotation & Invalidation**: Refresh tokens rotate on every use. Revoked tokens are immediately flagged, and token reuse triggers user-wide session invalidation. Logging out explicitly revokes tokens and clears cookies.
- **Password Security**: Passwords hashed using `bcryptjs` with 12 salt rounds. Raw passwords and password hashes are never returned in any API response.
- **Brute-Force Protection**: Sliding-window rate limiting on `/api/auth/login` (5 failed attempts per IP/email locks authentication for 15 minutes).
- **Audit Logging**: Sensitive actions (`USER_LOGIN`, `USER_LOGOUT`, `USER_CREATED`, `PASSWORD_CHANGED`, `DEPARTMENT_CREATED`) are logged in the `audit_logs` table.

---

## 🏛️ Roles & Authority Matrix

| Role | Scope | Key Capabilities | Permitted Task Categories |
| :--- | :--- | :--- | :--- |
| **System Admin** | Global / Infrastructure | User account creation, role assignment, department administration. | None (cannot allocate academic tasks; distinct administrative role). |
| **Head of Department (HOD)** | Department Scope | Highest departmental authority. Manages faculty records within their department. | **All 5 categories**: Teaching, Research, Grading, Meetings, Administrative. |
| **Professor** | Department Scope | Can allocate work to eligible Assistant Professors in the same department. | **4 categories**: Teaching, Research, Grading, Meetings (Administrative prohibited). |
| **Assistant Professor** | Department Scope | Primarily executes assigned work. Cannot delegate by default. | **3 categories**: Teaching, Research, Grading (only when `can_assign_work` is enabled). |

### Security Guarantees:
1. **Department Isolation**: Departmental faculty (HOD, Professor, Assistant Professor) can only view and manage faculty within their assigned department. Cross-department requests are rejected with `403 Forbidden`.
2. **Privilege Escalation Defense**: Non-admin self-update endpoints (`PATCH /api/users/:id`) strictly prohibit modifying `role`, `department_id`, `can_assign_work`, or `is_active`. Attempts are rejected with `403 Forbidden`.
3. **Server-Side Enforcement**: The frontend adapts navigation for usability, but every permission, role check, and department boundary is independently verified by backend middleware.

---

## 🗄️ Database Schema & Migrations

### Tables

1. **`departments`**:
   - `id` (INT PK AI), `code` (VARCHAR(20) UNIQUE), `name` (VARCHAR(150) UNIQUE), `description` (TEXT), `created_at`, `updated_at`.
2. **`users`**:
   - `id` (INT PK AI), `email` (VARCHAR(255) UNIQUE), `password_hash` (VARCHAR(255)), `full_name` (VARCHAR(150)), `role` (ENUM), `department_id` (FK -> `departments.id` ON DELETE RESTRICT), `can_assign_work` (BOOLEAN DEFAULT FALSE), `is_active` (BOOLEAN DEFAULT TRUE), `created_at`, `updated_at`.
3. **`refresh_tokens`**:
   - `id` (INT PK AI), `user_id` (FK -> `users.id` ON DELETE CASCADE), `token_hash` (VARCHAR(64) UNIQUE), `expires_at`, `revoked_at`, `ip_address`, `user_agent`, `created_at`.
4. **`audit_logs`**:
   - `id` (INT PK AI), `actor_id` (FK -> `users.id` ON DELETE SET NULL), `action` (VARCHAR(100)), `target_type` (VARCHAR(50)), `target_id` (INT), `details` (JSON), `ip_address`, `created_at`.
5. **`tasks`** (Phase 3):
   - `id` (INT PK AI): Unique task identifier.
   - `title` (VARCHAR(200)): Mandatory task title.
   - `description` (TEXT): Detailed deliverables, syllabus coverage, or instructions.
   - `category` (ENUM): Canonical categories (`Teaching`, `Research`, `Grading`, `Meetings`, `Administrative`).
   - `priority` (ENUM): Canonical priorities (`Low`, `Medium`, `High`, DEFAULT `Medium`).
   - `status` (ENUM): Canonical states (`Pending`, `In Progress`, `Completed`, DEFAULT `Pending`).
   - `due_date` (DATE): MySQL calendar date (`YYYY-MM-DD`).
   - `creator_id` (FK -> `users.id` ON DELETE RESTRICT): Server-derived authenticated creator.
   - `assignee_id` (FK -> `users.id` ON DELETE RESTRICT): Assigned faculty recipient.
   - `department_id` (FK -> `departments.id` ON DELETE RESTRICT): Departmental scope isolation.
   - `completed_at` (TIMESTAMP NULL): Recorded automatically upon task completion.
   - `created_at` / `updated_at` (TIMESTAMP): Automatic timestamp management.
   - **Indexes**: `(department_id, status)`, `(assignee_id, status)`, `(creator_id)`, `(due_date)`.
6. **`schema_migrations`**:
   - Tracks executed migration files in sequence with transaction rollback safety.

### Migration Commands
```bash
# Run pending migrations (applies 001, 002, and 003)
npm run db:migrate

# Seed development departments and test accounts
npm run db:seed
```

> **Migration Limitations**: Migrations apply forward additively. Downward rollbacks must be planned via compensating forward migrations to preserve relational integrity and avoid data loss.

---

## 🔌 API Endpoints Summary

### Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | Authenticates credentials, sets HttpOnly cookies, returns user & tokens. |
| `POST` | `/api/auth/logout` | Public/Auth | Revokes refresh token in database and clears session cookies. |
| `POST` | `/api/auth/refresh` | Public/Cookie | Rotates and issues a new access token using a valid refresh token. |
| `GET` | `/api/auth/me` | Authenticated | Returns currently authenticated user profile and department details. |
| `POST` | `/api/auth/change-password` | Authenticated | Validates current password, updates hash, and revokes all active sessions. |

### Users (`/api/users`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/users` | Authenticated | Lists users (System Admin: all; Faculty: scoped to their department). |
| `POST` | `/api/users` | System Admin | Creates a user account with assigned role and department. |
| `GET` | `/api/users/:id` | Authenticated | Gets user by ID (scoped to same department for non-admins). |
| `PATCH` | `/api/users/:id` | Admin / Self | Admin updates any field; Self can only update `fullName`. |

### Departments (`/api/departments`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/departments` | Authenticated | Lists all academic departments with faculty counts. |
| `POST` | `/api/departments` | System Admin | Creates a new academic department. |
| `GET` | `/api/departments/:id` | Authenticated | Returns department details. |
| `GET` | `/api/departments/:id/faculty` | Scoped | Lists faculty in department (Admin or members of that department). |

### Task Management & Faculty Assignments (`/api/tasks`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/tasks` | Authenticated | Lists authorized departmental tasks with filtering (`status`, `category`, `priority`, `view`, `search`) and pagination. |
| `POST` | `/api/tasks` | Role Policy | Creates a task and assigns to eligible recipient in creator's department. |
| `GET` | `/api/tasks/summary` | Authenticated | Computes aggregated departmental workload metrics (total, pending, in progress, completed, high priority, by category). |
| `GET` | `/api/tasks/eligible-assignees` | Authenticated | Returns real authorized recipients for signed-in user's role and category. |
| `GET` | `/api/tasks/:id` | Scoped Auth | Retrieves full task record with creator, assignee, and department objects. |
| `PATCH` | `/api/tasks/:id` | Creator / HOD | Updates task details (`title`, `description`, `priority`, `dueDate`). |
| `PATCH` | `/api/tasks/:id/assign` | Creator / HOD | Reassigns task transactionally to an eligible recipient in same department. |
| `PATCH` | `/api/tasks/:id/status` | Assignee/Creator/HOD | Transitions status (`Pending` -> `In Progress` -> `Completed`) and records `completed_at`. |
| `DELETE` | `/api/tasks/:id` | Creator / HOD | Deletes/archives task. |
| `POST` | `/api/tasks/evaluate-allocation` | Authenticated | Policy evaluation endpoint checking actor authority against target & category. |

### Health Checks (`/health`, `/api/health`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | System uptime, environment, and MySQL database connection status. |

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` or configure `server/.env`:

```env
# Server Configuration
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# MySQL Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_secure_password_here
DB_NAME=faculty_flow_db
DB_CONNECTION_LIMIT=10

# Authentication & Security
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
COOKIE_SECRET=your_cookie_encryption_secret_here

# Frontend Configuration (client/.env)
VITE_API_URL=http://localhost:5000/api
```

---

## 🧪 Development & Verification Commands

```bash
# Install dependencies across all workspaces
npm install

# Run database migrations
npm run db:migrate

# Seed development test accounts (password for all: Password@12345)
npm run db:seed

# Run all automated tests (46 tests total: 41 server, 5 client)
npm run test

# Run backend test suites (Supertest + Vitest)
npm run test:server

# Run frontend test suites (React Testing Library + Vitest)
npm run test:client

# TypeScript strict type checking
npm run typecheck

# Build production bundles
npm run build

# Start both backend and frontend concurrently
npm run dev
```

---

## 📅 Workload & Task Integrity

1. **Consistent Workload Aggregations**:
   - `GET /api/tasks/summary` calculates metrics grouped strictly by current status (`Pending`, `In Progress`, `Completed`) and categories.
   - Reassignment transfers the assignee pointer transactionally without duplicating records.
   - Completing a task sets `completed_at = CURRENT_TIMESTAMP`, accurately reflecting resolution time.
2. **Date & Timezone Predictability**:
   - Due dates are stored using MySQL `DATE` format (`YYYY-MM-DD`).
   - Responses serialize calendar dates directly as `YYYY-MM-DD` strings, preventing unwanted 1-day timezone shifting across local timezones (e.g. `Asia/Kolkata` vs UTC midnight).
   - Display interpretations in the React UI format dates using institutional locale conventions.
3. **Data Integrity & Concurrency**:
   - Task assignment changes and status updates execute within parameterized SQL queries.
   - Foreign key constraints (`creator_id`, `assignee_id`, `department_id`) strictly prevent orphan task records.
   - Disabled/inactive users cannot be assigned new tasks.

---

## 👤 Development Test Accounts

When `npm run db:seed` is executed, the following baseline test accounts are provisioned (default password: `Password@12345`):

| Email | Role | Department | Delegation Privilege |
| :--- | :--- | :--- | :--- |
| `admin@facultyflow.local` | `SYSTEM_ADMIN` | Global | False |
| `hod.cs@facultyflow.local` | `HOD` | Computer Science (`CS`) | True (All 5 Categories) |
| `prof.cs@facultyflow.local` | `PROFESSOR` | Computer Science (`CS`) | True (4 Categories) |
| `asst.cs@facultyflow.local` | `ASSISTANT_PROFESSOR` | Computer Science (`CS`) | False (Denied by default) |
| `asst.lead.cs@facultyflow.local` | `ASSISTANT_PROFESSOR` | Computer Science (`CS`) | True (3 Categories) |
| `hod.mech@facultyflow.local` | `HOD` | Mechanical Eng (`MECH`) | True (All 5 Categories) |
| `prof.mech@facultyflow.local` | `PROFESSOR` | Mechanical Eng (`MECH`) | True (4 Categories) |
| `inactive@facultyflow.local` | `ASSISTANT_PROFESSOR` | Computer Science (`CS`) | Inactive / Disabled |

---

## 📋 Manual Verification Procedure

To verify role permissions and task isolation using the development seed accounts:

### 1. System Admin Verification (`admin@facultyflow.local`)
1. Log in via frontend or API.
2. Verify access to User Management and Department Management.
3. Attempt to allocate a task or navigate to Tasks: observe that System Admin does not have departmental task allocation privileges (`403 Forbidden` on `/api/tasks`).

### 2. Head of Department Verification (`hod.cs@facultyflow.local`)
1. Log in as HOD of Computer Science.
2. Navigate to the **Tasks** tab.
3. Click **Assign New Task**.
4. Verify all 5 categories (`Teaching`, `Research`, `Grading`, `Meetings`, `Administrative`) are selectable.
5. Create an `Administrative` task assigned to `prof.cs@facultyflow.local`. Observe success.
6. Check the assignee dropdown: observe that only active faculty from the Computer Science department are listed (Mechanical Engineering faculty are omitted).

### 3. Professor Verification (`prof.cs@facultyflow.local`)
1. Log in as Professor of Computer Science.
2. Navigate to **Tasks** and click **Assign New Task**.
3. Verify that `Administrative` is not selectable (only `Teaching`, `Research`, `Grading`, `Meetings` are permitted).
4. Direct API Check: Attempt `POST /api/tasks` with `category: "Administrative"`. Verify response is `403 Forbidden: Professors are not permitted to allocate Administrative tasks`.
5. Verify eligible assignees in dropdown only shows Assistant Professors (`asst.cs@facultyflow.local`, `asst.lead.cs@facultyflow.local`).

### 4. Assistant Professor Verification (`asst.cs@facultyflow.local` & `asst.lead.cs@facultyflow.local`)
1. Log in as standard Assistant Professor (`asst.cs@facultyflow.local`).
2. Verify the **Assign New Task** button is hidden.
3. Direct API Check: Attempt `POST /api/tasks`. Verify response is `403 Forbidden: Assistant Professors are not authorized to allocate work by default`.
4. Log in as delegated Assistant Professor (`asst.lead.cs@facultyflow.local`).
5. Observe **Assign New Task** is enabled. Verify permitted categories are `Teaching`, `Research`, and `Grading`.

### 5. Cross-Department & Boundary Isolation Verification
1. As `hod.cs@facultyflow.local`, attempt to create or view a task belonging to `MECH` department (`departmentId: 2`). Verify response is `403 Forbidden`.
2. As `hod.cs@facultyflow.local`, attempt to assign a task to `prof.mech@facultyflow.local`. Verify response is `403 Forbidden: Assignee must belong to the same department as the creator`.
3. Attempt to pass client-supplied `creatorId` or `departmentId` in task payload. Verify server derives the creator and department strictly from authenticated session context.
