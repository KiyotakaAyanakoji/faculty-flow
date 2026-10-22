# Faculty Flow 2.0

> Modern Academic Operations & Faculty Management System
> **Phase 1: Foundation Layer** • **Phase 2: Authentication & RBAC** • **Phase 3: Task Management & Faculty Assignments** • **Phase 4: Dashboards, Workload, Syllabus & Handovers** • **Phase 5: Academic Calendar, Events & Secure PDF Uploads**

Faculty Flow 2.0 is an enterprise-grade academic operations platform designed for higher education institutions. This repository features a modular, decoupled full-stack architecture built with React 19 (Vite + TypeScript), Node.js (Express + TypeScript), and MySQL.

---

## 🏗️ Architecture Overview

The codebase is organized as an npm workspaces monorepo:

```text
faculty_flow/
├── client/                     # Frontend Application (React 19 + Vite + TypeScript)
│   ├── src/
│   │   ├── components/         # UI components (DashboardView, TaskManagementView, SyllabusManagementView, HandoverManagementView, CalendarManagementView, LoginForm, Navbar, HealthCard, etc.)
│   │   ├── context/            # AuthContext & useAuth session hook
│   │   ├── test/               # Vitest + React Testing Library suites (App, Dashboard, Tasks, Syllabus, Handovers, Calendar)
│   │   ├── types/              # Client auth, department, task, dashboard, syllabus, handover, and event type definitions
│   │   ├── App.tsx             # Root authenticated shell, role-based navigation tabs, and public landing
│   │   ├── App.css             # Modern dark-mode responsive layout and glassmorphism styling
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
│   │   ├── constants/          # Role definitions, RBAC policies, task priorities, statuses, event categories
│   │   ├── controllers/        # Dashboard, Task, Syllabus, Handover, Event, Auth, User, Department, Health controllers
│   │   ├── db/                 # Transactional migration runner, seed script, SQL files
│   │   │   ├── migrations/
│   │   │   │   ├── 001_initial_schema.sql            # Schema migration tracker & system metadata
│   │   │   │   ├── 002_auth_and_rbac.sql             # Departments, Users, Tokens, Audit Logs
│   │   │   │   ├── 003_tasks_and_assignments.sql     # Tasks, Assignments, Statuses, Deadlines
│   │   │   │   ├── 004_syllabus_and_handovers.sql    # Syllabuses, Units, Faculty Handovers, Task Linkages
│   │   │   │   └── 005_academic_calendar_and_documents.sql # Academic Events, Attendees, Secure PDF Attachments
│   │   │   ├── migrate.ts                            # Migration runner
│   │   │   └── seed.ts                               # Safe development database seeder
│   │   ├── middleware/         # Auth verification, RBAC guards, rate limiter, upload/magic bytes, error handlers
│   │   ├── routes/             # Modular routers (/health, /auth, /users, /departments, /tasks, /dashboard, /syllabus, /handovers, /events)
│   │   ├── services/           # JWT & DB-backed refresh token service, audit logging, safe storage service
│   │   ├── types/              # Server user, token, task, dashboard, syllabus, handover, event Express typings
│   │   ├── validators/         # Zod schemas for input validation (auth, user, task, syllabus, handover, event)
│   │   ├── app.ts              # Express application factory & middleware chain
│   │   └── index.ts            # Server entry point with DB check & graceful shutdown
│   ├── test/                   # Vitest + Supertest backend test suites
│   │   ├── auth.test.ts        # Authentication, password hashing, and cookie tests
│   │   ├── rbac.test.ts        # Role permissions, department isolation, and matrix tests
│   │   ├── tasks.test.ts       # Task management, role permissions, scoping, reassignment
│   │   ├── dashboard.test.ts   # Role-specific dashboard views and workload aggregations (Phase 4)
│   │   ├── syllabus.test.ts    # Course syllabus management, progress tracking & isolation (Phase 4)
│   │   ├── handovers.test.ts   # Faculty handover lifecycle, task linkage & permissions (Phase 4)
│   │   ├── events.test.ts      # Academic calendar, attendee validation, secure PDF uploads & magic bytes (Phase 5)
│   │   └── health.test.ts      # Phase 1 health check smoke tests
│   ├── uploads/                # Private local storage directory for secured PDF attachments (.gitignored)
│   ├── .env.example            # Server environment template
│   ├── package.json            # Server dependencies and scripts
│   └── tsconfig.json           # Server TypeScript configuration
│
├── .env.example                # Root environment template
├── .gitignore                  # Strict Git rules preventing secret, upload, and artifact leaks
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
6. **`syllabuses`** (Phase 4):
   - `id` (INT PK AI): Unique course syllabus identifier.
   - `department_id` (FK -> `departments.id` ON DELETE RESTRICT): Scoped to department.
   - `course_code` (VARCHAR(30)): Course identifier (e.g., `CS301`).
   - `course_name` (VARCHAR(200)): Full course name.
   - `academic_year` (VARCHAR(50)): Academic year or term (e.g., `2026-2027`).
   - `units` (JSON): Structured array of syllabus units/topics with titles, hours, and objectives.
   - `completion_percentage` (TINYINT UNSIGNED DEFAULT 0): Real-time progress (0-100%).
   - `status` (ENUM): `Draft`, `In Progress`, `Completed`, `Archived` (DEFAULT `Draft`).
   - `responsible_faculty_id` (FK -> `users.id` ON DELETE SET NULL): Responsible instructor in same department.
   - `created_by` (FK -> `users.id` ON DELETE RESTRICT): Creator faculty member.
   - `created_at` / `updated_at` (TIMESTAMP): Automatic timestamp management.
   - **Indexes**: `(department_id, status)`, `(responsible_faculty_id)`, `(course_code)`.
7. **`handovers`** (Phase 4):
   - `id` (INT PK AI): Unique academic handover record identifier.
   - `sender_id` (FK -> `users.id` ON DELETE RESTRICT): Server-derived authenticated sender.
   - `recipient_id` (FK -> `users.id` ON DELETE RESTRICT): Recipient faculty member in same department.
   - `department_id` (FK -> `departments.id` ON DELETE RESTRICT): Scoped to departmental boundaries.
   - `related_task_id` (FK -> `tasks.id` ON DELETE SET NULL): Optional linked task for academic continuity.
   - `title` (VARCHAR(255)): Mandatory handover summary title.
   - `notes` (TEXT): Detailed context, guidelines, and deliverables.
   - `deadline` (DATE NULL): Relevant handover completion deadline (`YYYY-MM-DD`).
   - `status` (ENUM): `Pending`, `Accepted`, `Rejected`, `Completed` (DEFAULT `Pending`).
   - `completed_at` (TIMESTAMP NULL): Recorded when marked completed.
   - `created_at` / `updated_at` (TIMESTAMP): Automatic timestamp management.
   - **Indexes**: `(sender_id, status)`, `(recipient_id, status)`, `(department_id, status)`, `(related_task_id)`.
8. **`academic_events`** (Phase 5):
   - `id` (INT PK AI): Unique event identifier.
   - `title` (VARCHAR(255)): Mandatory event title.
   - `description` (TEXT NULL): Agenda, guidelines, or event notes.
   - `category` (ENUM): Canonical event types (`Exam`, `Meeting`, `Holiday`, `Submission`, `Conference`, `Workshop`).
   - `start_time` / `end_time` (DATETIME): Validated event timeframe (`end_time >= start_time`).
   - `is_all_day` (BOOLEAN DEFAULT FALSE): Flag for full-day academic occurrences.
   - `location` (VARCHAR(255) NULL): Physical venue or classroom.
   - `meeting_link` (VARCHAR(500) NULL): Virtual conference/meeting URL.
   - `department_id` (FK -> `departments.id` ON DELETE RESTRICT): Departmental scope (NULL = institution-wide).
   - `creator_id` (FK -> `users.id` ON DELETE RESTRICT): Server-derived authenticated creator.
   - `created_at` / `updated_at` (TIMESTAMP): Automatic timestamp tracking.
   - **Indexes**: `(department_id)`, `(creator_id)`, `(category)`, `(start_time, end_time)`.
9. **`event_participants`** (Phase 5):
   - `id` (INT PK AI): Unique participant link identifier.
   - `event_id` (FK -> `academic_events.id` ON DELETE CASCADE): Parent academic event.
   - `user_id` (FK -> `users.id` ON DELETE CASCADE): Invited faculty member in authorized department.
   - `status` (ENUM): Attendance status (`Invited`, `Accepted`, `Declined`, `Tentative`, DEFAULT `Invited`).
   - `created_at` (TIMESTAMP): Invitation timestamp.
   - **Constraints**: `UNIQUE KEY (event_id, user_id)`, `INDEX (event_id)`, `INDEX (user_id)`.
10. **`event_documents`** (Phase 5):
    - `id` (INT PK AI): Unique attachment identifier.
    - `event_id` (FK -> `academic_events.id` ON DELETE CASCADE): Associated academic event.
    - `file_identifier` (VARCHAR(100) UNIQUE): Cryptographic UUID filename (`<uuid>.pdf`).
    - `original_name` (VARCHAR(255)): Display filename.
    - `mime_type` (VARCHAR(100)): Validated MIME type (`application/pdf`).
    - `file_size` (INT): Validated document size (max 10 MB).
    - `uploader_id` (FK -> `users.id` ON DELETE RESTRICT): Faculty member who uploaded the document.
    - `created_at` / `updated_at` (TIMESTAMP): Audit timestamps.
    - **Indexes**: `(event_id)`, `(uploader_id)`.
11. **`schema_migrations`**:
    - Tracks executed migration files in sequence (`001`, `002`, `003`, `004`, `005`) with transaction rollback safety.

### Migration Commands
```bash
# Run pending migrations (applies 001, 002, 003, 004, and 005)
npm run db:migrate

# Seed development departments and test accounts
npm run db:seed
```

> **Migration Limitations**: Migrations apply forward additively. Downward rollbacks must be planned via compensating forward migrations to preserve relational integrity and avoid data loss.

---

## 🔌 API Endpoints Summary

### Academic Calendar & Events (`/api/events`) (Phase 5)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/events` | Authenticated | Lists academic events accessible to user (department + institute-wide) with filters (`startDate`, `endDate`, `category`, `search`). |
| `POST` | `/api/events` | HOD / Professor / Admin | Creates an academic event with transactionally managed attendees in the user's department. |
| `GET` | `/api/events/eligible-participants` | Authenticated | Returns eligible active faculty members in the department for attendee selection. |
| `GET` | `/api/events/:id` | Scoped Auth | Retrieves full event record including attendee list and attached PDF metadata. |
| `PATCH` | `/api/events/:id` | Creator / HOD | Updates event details and synchronizes attendees without duplicates. |
| `DELETE` | `/api/events/:id` | Creator / HOD | Deletes event and purges all attached physical storage files. |
| `POST` | `/api/events/:id/documents` | Attendee / Creator / HOD | Attaches a secure PDF document (10MB limit, validated `%PDF-` magic bytes). |
| `GET` | `/api/events/:id/documents/:docId/download` | Scoped Auth | Authenticated streaming download of attached PDF. |
| `DELETE` | `/api/events/:id/documents/:docId` | Uploader / Creator / HOD | Deletes document record and unlinks file from private storage. |

### Dashboards & Workload (`/api/dashboard`) (Phase 4)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/dashboard` | Authenticated | Returns role-specific dashboard metrics, workload aggregations, overdue/upcoming counts, and department data tailored to the authenticated role. |

### Syllabus Tracking & Management (`/api/syllabus`) (Phase 4)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/syllabus` | Authenticated | Lists departmental course syllabuses with filters (`status`, `academicYear`, `responsibleFacultyId`, `search`). |
| `POST` | `/api/syllabus` | HOD / Professor | Creates a new course syllabus in the user's department. |
| `GET` | `/api/syllabus/:id` | Scoped Auth | Retrieves full syllabus record including units and assigned instructor. |
| `PATCH` | `/api/syllabus/:id` | HOD / Creator | Updates syllabus details, course units, and assigned instructor. |
| `PATCH` | `/api/syllabus/:id/progress` | Instructor / HOD | Updates course completion percentage (0-100%) and syllabus status. |
| `DELETE` | `/api/syllabus/:id` | HOD | Deletes/archives course syllabus. |

### Faculty Academic Handovers (`/api/handovers`) (Phase 4)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/handovers` | Authenticated | Lists authorized handovers (Sender, Recipient, or HOD within department) with filters (`filter=sent\|received\|all`, `status`, `relatedTaskId`). |
| `POST` | `/api/handovers` | Authenticated | Initiates an academic handover to a faculty member in the same department. Sender derived server-side. |
| `GET` | `/api/handovers/:id` | Scoped Auth | Retrieves handover details with sender, recipient, and linked task context. |
| `PATCH` | `/api/handovers/:id/status` | Recipient/Sender/HOD | Transitions handover status (`Pending` -> `Accepted`/`Rejected` -> `Completed`). |
| `DELETE` | `/api/handovers/:id` | Sender / HOD | Deletes/withdraws a pending handover. |

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

# Run all automated tests (84 tests total: 72 server, 12 client)
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

## 🔒 Secure Document Storage Architecture & Cloud Strategy

### 1. Private Local Storage Adapter
- Uploaded PDF documents are stored in `server/uploads/events/` (or configurable via `EVENT_UPLOAD_DIR`).
- The directory is strictly private and **never served via Express static middleware or client asset pipelines**.
- `.gitignore` explicitly excludes `uploads/` and `server/uploads/` to guarantee no uploaded files or sensitive student/course materials are committed to source control.

### 2. Multi-Layer Validation & Magic Bytes Inspection
- **File Size Limit**: Documented 10 MB limit (`10 * 1024 * 1024` bytes) enforced in Multer middleware and client-side form validation.
- **MIME & Extension**: Client-provided extension (`.pdf`) and MIME type (`application/pdf`) are checked as a first pass.
- **Cryptographic Signature Inspection**: Before storing or committing metadata to MySQL, the server reads the initial file header bytes to confirm the `%PDF-` magic byte signature (`0x25 0x50 0x44 0x46 0x2D`). Disguised plain text or executable files renamed to `.pdf` are immediately deleted and rejected with `400 Bad Request`.
- **Safe Server-Side Storage Identifiers**: User-provided filenames are never written to disk paths. Files are stored as `<uuid>.pdf` while the original sanitized name is stored in MySQL for download delivery.
- **Path Traversal Protection**: File paths are resolved using `path.basename` and validated against directory bounds to prevent directory traversal attacks (`../`).

### 3. Production Cloud Object Storage Migration Plan
The decoupling implemented in `server/src/services/storage.service.ts` allows a seamless drop-in transition to cloud object storage (e.g. AWS S3, Google Cloud Storage, or MinIO):
1. **Upload**: Stream multipart upload directly to an S3 bucket with private ACL (`PutObjectCommand`).
2. **Download**: Issue short-lived, authenticated pre-signed URLs (e.g. 5-minute expiration) directly from S3, or stream through Express with authorized caching headers.
3. **Deletion**: Call `DeleteObjectCommand` using the stored UUID key upon event or document deletion.

---

## 📅 Workload, Calendar & Timezone Integrity

1. **Consistent Workload Aggregations**:
   - `GET /api/tasks/summary` and `GET /api/dashboard` calculate metrics grouped strictly by current status (`Pending`, `In Progress`, `Completed`), categories, and priorities.
   - Reassignment transfers the assignee pointer transactionally without duplicating records.
   - Completing a task sets `completed_at = CURRENT_TIMESTAMP`, accurately reflecting resolution time.
2. **Date & Timezone Predictability (Asia/Kolkata)**:
   - Due dates and deadlines are stored using MySQL `DATE` (`YYYY-MM-DD`).
   - Timed academic events store `start_time` and `end_time` using MySQL `DATETIME` (`YYYY-MM-DD HH:MM:SS`), serialized explicitly to ISO strings.
   - Display formatting in the React UI uses Indian standard formatting conventions (`en-IN`), rendering dates as `22 October 2026` and times as `10:30 AM`.
   - Date range boundaries properly support events that cross midnight or multi-day intervals.
3. **Data Integrity & Concurrency**:
   - Task assignment changes, syllabus progress updates, and event attendee updates execute within transactional SQL queries.
   - Foreign key constraints strictly prevent orphan records.
   - Disabled/inactive users cannot be invited to events or assigned work.

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

To verify role permissions, dashboards, syllabus tracking, handovers, calendar events, and secure PDF uploads:

### 1. System Admin Verification (`admin@facultyflow.local`)
1. Log in via frontend or API.
2. Verify access to User Management and Department Management.
3. Access Dashboard: Observe system-level metrics (active users, departments, recent logins/audit events).
4. Verify that System Admin does not have departmental academic access (HOD dashboard and task allocation return `403 Forbidden`).

### 2. Head of Department Verification (`hod.cs@facultyflow.local`)
1. Log in as HOD of Computer Science.
2. Navigate to the **Dashboard** tab:
   - View Department Workload Summary (total tasks, pending, in progress, completed).
   - View Overdue & Upcoming 7-Day task counts calculated in backend.
   - View Department Tasks distribution by Category and Priority.
   - View Faculty Workload breakdown (tasks assigned per faculty member).
   - View Course Syllabus completion indicators and Active Handovers.
3. Navigate to the **Tasks** tab and verify full allocation permissions.

### 3. Professor Verification (`prof.cs@facultyflow.local`)
1. Log in as Professor of Computer Science.
2. Navigate to **Dashboard**:
   - View personal assigned tasks and personal created tasks.
   - View personal workload counts and permitted departmental summary.
   - Verify private tasks from other faculty are not exposed.
3. Verify that `Administrative` tasks cannot be assigned.

### 4. Assistant Professor Verification (`asst.cs@facultyflow.local`)
1. Log in as Assistant Professor (`asst.cs@facultyflow.local`).
2. Navigate to **Dashboard**:
   - View personal assigned tasks, task statuses, deadlines, and personal workload metrics.
   - Verify departmental-wide task lists and private peer allocations are hidden.
3. Verify task status transition buttons (`Start Working` -> `In Progress`, `Complete Task` -> `Completed`).

### 5. Syllabus Tracking & Progress Updates
1. As `hod.cs@facultyflow.local` or `prof.cs@facultyflow.local`, navigate to the **Syllabus** tab.
2. Click **Add Course Syllabus** and create course `CS301` ("Operating Systems & Concurrency") for term `2026-2027` assigned to `prof.cs@facultyflow.local`.
3. Verify syllabus displays with progress bar and units count.
4. As assigned instructor or HOD, click **Update Progress** and adjust completion to 60% and status to `In Progress`. Observe real-time progress update.
5. Attempt unauthorized modification: As faculty from `MECH` department, attempt to update CS syllabus progress via `PATCH /api/syllabus/:id/progress` -> Verify `403 Forbidden`.
6. Non-HOD users attempting to delete syllabus records receive `403 Forbidden`.

### 6. Faculty Academic Handovers
1. As `hod.cs@facultyflow.local` or `prof.cs@facultyflow.local`, navigate to the **Handovers** tab.
2. Click **Initiate Handover**, select recipient `asst.cs@facultyflow.local`, link an existing task, enter handover title and context, and submit.
3. Verify sender cannot spoof client-supplied `senderId` (server binds `sender_id` directly to authenticated session token).
4. Log in as recipient `asst.cs@facultyflow.local`, navigate to **Handovers**, filter by **Received**:
   - Observe incoming handover with linked task context.
   - Click **Accept Handover** -> Status transitions to `Accepted`.
   - Click **Mark Completed** -> Status transitions to `Completed` with recorded completion timestamp.
5. Department and Privacy Isolation: Faculty from `MECH` department attempting to view or modify this handover receive `403 Forbidden`.

### 7. Academic Calendar & Secure PDF Uploads (Phase 5)
1. **Event Scheduling**:
   - As `hod.cs@facultyflow.local` or `prof.cs@facultyflow.local`, navigate to the **Calendar** tab.
   - Click **Schedule Academic Event**.
   - Enter title `Operating Systems Midterm Examination`, category `Exam`, start date/time, and end date/time in Indian format.
   - Select faculty attendees `Claude Shannon` (`asst.cs@facultyflow.local`). Submit.
   - Observe the event badge rendered on the monthly calendar grid and in the list view.
2. **Date & Range Validation**:
   - Attempt to create an event with end time earlier than start time -> Observe client and server rejection (`400 Bad Request`).
3. **Role Enforcement**:
   - Log in as `asst.cs@facultyflow.local`: Observe that Assistant Professors can view the Calendar and attended events, but the `Schedule Academic Event` button is hidden. Direct API attempts return `403 Forbidden`.
4. **Secure PDF Upload & Magic Bytes**:
   - Click the created event to open the Event Details modal.
   - In the Attached PDF Documents section, select a valid PDF (`.pdf` starting with `%PDF-`). Click **Upload PDF** -> Observe success and document listed with file size.
   - Click **Download** -> Verify browser downloads the file safely with `attachment; filename="..."` headers.
   - Attempt to upload a disguised text file renamed to `.pdf` -> Server rejects with `400 Bad Request: File contents do not match a valid PDF document signature`, and file is deleted from disk.
   - Attempt to upload a file > 10 MB -> Server rejects with `400 Bad Request: File size exceeds maximum limit of 10 MB`.
5. **Cross-Department Security**:
   - Log in as `hod.mech@facultyflow.local` and attempt to download the CS exam document via API -> Verify `403 Forbidden: You cannot access documents from another department`.
