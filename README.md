# Faculty Flow 2.0

> Modern Academic Operations & Faculty Management System
> **Phase 1: Foundation Layer** • **Phase 2: Authentication & RBAC** • **Phase 3: Task Management & Faculty Assignments** • **Phase 4: Dashboards, Workload, Syllabus & Handovers** • **Phase 5: Academic Calendar, Events & Secure PDF Uploads** • **Phase 6: Leave Management** • **Phase 7: Email Notifications**

Faculty Flow 2.0 is an enterprise-grade academic operations platform designed for higher education institutions. This repository features a modular, decoupled full-stack architecture built with React 19 (Vite + TypeScript), Node.js (Express + TypeScript), and MySQL.

---

## 🏗️ Architecture Overview

The codebase is organized as an npm workspaces monorepo:

```text
faculty_flow/
├── client/                     # Frontend Application (React 19 + Vite + TypeScript)
│   ├── src/
│   │   ├── components/         # UI components (LeaveManagementView, CalendarManagementView, DashboardView, TaskManagementView, SyllabusManagementView, HandoverManagementView, LoginForm, Navbar, HealthCard)
│   │   ├── context/            # AuthContext & useAuth session hook
│   │   ├── test/               # Vitest + React Testing Library suites (App, Dashboard, Tasks, Syllabus, Handovers, Calendar, Leaves)
│   │   ├── types/              # Client auth, department, task, dashboard, syllabus, handover, event, and leave type definitions
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
│   │   ├── constants/          # Role definitions, RBAC policies, task priorities, event categories, leave types & statuses
│   │   ├── controllers/        # Leave, Event, Dashboard, Task, Syllabus, Handover, Auth, User, Department, Health controllers
│   │   ├── db/                 # Transactional migration runner, seed script, SQL files
│   │   │   ├── migrations/
│   │   │   │   ├── 001_initial_schema.sql            # Schema migration tracker & system metadata
│   │   │   │   ├── 002_auth_and_rbac.sql             # Departments, Users, Tokens, Audit Logs
│   │   │   │   ├── 003_tasks_and_assignments.sql     # Tasks, Assignments, Statuses, Deadlines
│   │   │   │   ├── 004_syllabus_and_handovers.sql    # Syllabuses, Units, Faculty Handovers, Task Linkages
│   │   │   │   ├── 005_academic_calendar_and_documents.sql # Academic Events, Attendees, Secure PDF Attachments
│   │   │   │   ├── 006_leave_management.sql          # Leave Types, Balances, Requests, Audit Records
│   │   │   │   └── 007_email_notifications.sql       # Durable Email Queue, Retries, Idempotency & Locking (Phase 7)
│   │   │   ├── migrate.ts                            # Migration runner
│   │   │   └── seed.ts                               # Safe development database seeder
│   │   ├── middleware/         # Auth verification, RBAC guards, rate limiter, upload/magic bytes, error handlers
│   │   ├── routes/             # Modular routers (/health, /auth, /users, /departments, /tasks, /dashboard, /syllabus, /handovers, /events, /leaves)
│   │   ├── services/           # Services (auth, audit, storage) & Email notification subsystem (Phase 7)
│   │   │   └── email/          # Email transports (SMTP, Dev, Mock), templates, sanitizer, queue service & worker
│   │   ├── types/              # Server user, token, task, dashboard, syllabus, handover, event, leave Express typings
│   │   ├── validators/         # Zod schemas for input validation (auth, user, task, syllabus, handover, event, leave)
│   │   ├── app.ts              # Express application factory & middleware chain
│   │   └── index.ts            # Server entry point with DB check, worker lifecycle & graceful shutdown
│   ├── test/                   # Vitest + Supertest backend test suites
│   │   ├── auth.test.ts        # Authentication, password hashing, and cookie tests
│   │   ├── rbac.test.ts        # Role permissions, department isolation, and matrix tests
│   │   ├── tasks.test.ts       # Task management, role permissions, scoping, reassignment
│   │   ├── dashboard.test.ts   # Role-specific dashboard views and workload aggregations (Phase 4)
│   │   ├── syllabus.test.ts    # Course syllabus management, progress tracking & isolation (Phase 4)
│   │   ├── handovers.test.ts   # Faculty handover lifecycle, task linkage & permissions (Phase 4)
│   │   ├── events.test.ts      # Academic calendar, attendee validation, secure PDF uploads & magic bytes (Phase 5)
│   │   ├── leaves.test.ts      # Faculty leave management, concurrency, row-locking & RBAC (Phase 6)
│   │   ├── notifications.test.ts # Email queue, retries, worker concurrency, and template tests (Phase 7)
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
11. **`leave_types`** (Phase 6):
    - `id` (INT PK AI): Unique leave type identifier.
    - `code` (VARCHAR(50) UNIQUE): Canonical code (`CASUAL`, `SICK`, `EARNED`, `UNPAID`).
    - `name` (VARCHAR(100)): Descriptive name (e.g., Casual Leave, Sick / Medical Leave).
    - `description` (TEXT): Policy notes.
    - `is_paid` (BOOLEAN DEFAULT TRUE): Paid or unpaid (LWP) classification.
    - `default_days_per_year` (DECIMAL(5,1) DEFAULT 0.0): Configurable annual institutional quota.
    - `requires_approval` (BOOLEAN DEFAULT TRUE): Flag requiring approver workflow.
    - `allow_half_day` (BOOLEAN DEFAULT TRUE): Supports half-day applications.
    - `created_at` / `updated_at` (TIMESTAMP): Audit timestamps.
12. **`leave_balances`** (Phase 6):
    - `id` (INT PK AI): Unique balance entry identifier.
    - `user_id` (FK -> `users.id` ON DELETE CASCADE): Faculty member.
    - `leave_type_id` (FK -> `leave_types.id` ON DELETE RESTRICT): Associated leave type.
    - `academic_year` (VARCHAR(50)): Academic year term (e.g., `2026-2027`).
    - `entitled_days` (DECIMAL(5,1) DEFAULT 0.0): Allocated days for year.
    - `used_days` (DECIMAL(5,1) DEFAULT 0.0): Approved and deducted days.
    - `pending_days` (DECIMAL(5,1) DEFAULT 0.0): Temporarily reserved days for awaiting requests.
    - `created_at` / `updated_at` (TIMESTAMP): Audit timestamps.
    - **Constraints**: `UNIQUE KEY (user_id, leave_type_id, academic_year)`, `INDEX (user_id, academic_year)`.
13. **`leave_requests`** (Phase 6):
    - `id` (INT PK AI): Unique request identifier.
    - `user_id` (FK -> `users.id` ON DELETE RESTRICT): Server-derived authenticated faculty requester.
    - `department_id` (FK -> `departments.id` ON DELETE RESTRICT): Departmental isolation boundary.
    - `leave_type_id` (FK -> `leave_types.id` ON DELETE RESTRICT): Requested leave policy type.
    - `start_date` / `end_date` (DATE): Requested calendar dates (`YYYY-MM-DD`).
    - `days_count` (DECIMAL(5,1)): Calculated duration in working days (excluding Sundays).
    - `is_half_day` (BOOLEAN DEFAULT FALSE): Half-day toggle flag.
    - `half_day_period` (ENUM('First Half', 'Second Half') NULL): Period when half-day is selected.
    - `reason` (TEXT): Mandatory statement for absence.
    - `status` (ENUM('Pending', 'Approved', 'Rejected', 'Cancelled') DEFAULT 'Pending'): Canonical state.
    - `approver_id` (FK -> `users.id` ON DELETE SET NULL): Designated HOD decision-maker.
    - `decision_notes` (TEXT NULL): Rationalization or reason recorded by approver or canceller.
    - `decision_timestamp` (TIMESTAMP NULL): Decision audit timestamp.
    - `created_at` / `updated_at` (TIMESTAMP): Audit timestamps.
    - **Indexes**: `(department_id, status)`, `(user_id, status)`, `(start_date, end_date)`.
14. **`leave_audit_logs`** (Phase 6):
    - `id` (INT PK AI): Unique balance adjustment audit log.
    - `user_id` (FK -> `users.id` ON DELETE CASCADE): Faculty member whose balance was affected.
    - `leave_type_id` (FK -> `leave_types.id` ON DELETE RESTRICT): Affected leave type.
    - `request_id` (FK -> `leave_requests.id` ON DELETE SET NULL): Linked leave request.
    - `academic_year` (VARCHAR(50)): Academic year term.
    - `action` (ENUM('ALLOCATION', 'RESERVATION', 'RESERVATION_RELEASE', 'DEDUCTION', 'RESTORATION', 'ADMIN_ADJUSTMENT')): Action type.
    - `days_changed` (DECIMAL(5,1)): Quantity changed (+ or -).
    - `previous_used_days` / `new_used_days` (DECIMAL(5,1)): Balance tracking.
    - `previous_pending_days` / `new_pending_days` (DECIMAL(5,1)): Reservation tracking.
    - `reason` (VARCHAR(255)): Human-readable audit note.
    - `actor_id` (FK -> `users.id` ON DELETE SET NULL): User triggering the action.
    - `created_at` (TIMESTAMP): Event timestamp.
15. **`email_notifications`** (Phase 7):
    - `id` (INT PK AI): Unique notification queue record identifier.
    - `idempotency_key` (VARCHAR(255) UNIQUE): Deterministic idempotency key preventing duplicate enqueueing and delivery.
    - `event_type` (VARCHAR(50)): Event name (e.g. `TASK_ASSIGNED`, `LEAVE_APPROVED`, `EVENT_INVITATION`, `HANDOVER_CREATED`).
    - `recipient_email` (VARCHAR(255)): Validated recipient email address.
    - `recipient_name` (VARCHAR(255) NULL): Sanitized recipient display name.
    - `recipient_id` (FK -> `users.id` ON DELETE SET NULL): Optional user link.
    - `template_id` (VARCHAR(50)): Registered template identifier.
    - `template_data` (JSON): Sanitized event metadata and parameters.
    - `status` (ENUM('Pending', 'Processing', 'Sent', 'Failed') DEFAULT 'Pending'): Delivery lifecycle state.
    - `attempts` (INT UNSIGNED DEFAULT 0): Delivery attempt counter.
    - `max_attempts` (INT UNSIGNED DEFAULT 5): Configurable retry threshold.
    - `next_retry_at` (TIMESTAMP NULL): Exponential backoff schedule.
    - `locked_at` / `locked_by` (TIMESTAMP NULL / VARCHAR(100) NULL): Distributed worker lease concurrency locks.
    - `error_summary` (TEXT NULL): Sanitized error message without leaking credentials or tokens.
    - `sent_at` (TIMESTAMP NULL): Successful delivery timestamp.
    - `created_at` / `updated_at` (TIMESTAMP): Audit timestamps.
    - **Indexes**: `(status, next_retry_at)`, `(locked_at)`, `(recipient_email)`, `(event_type)`, `UNIQUE (idempotency_key)`.
16. **`schema_migrations`**:
    - Tracks executed migration files in sequence (`001`, `002`, `003`, `004`, `005`, `006`, `007`) with transaction rollback safety.

### Migration Commands
```bash
# Run pending migrations (applies 001, 002, 003, 004, 005, 006, and 007)
npm run db:migrate

# Seed development departments, faculty test accounts, and leave entitlements
npm run db:seed
```

> **Migration Limitations**: Migrations apply forward additively. Downward rollbacks must be planned via compensating forward migrations to preserve relational integrity and avoid data loss.

---

## 🔌 API Endpoints Summary

### Faculty Leave Management (`/api/leaves`) (Phase 6)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/leaves/types` | Authenticated | Lists configured institutional leave types, quotas, paid/unpaid flags, and half-day policies. |
| `GET` | `/api/leaves/balances` | Authenticated | Retrieves current authenticated faculty member's leave entitlements, used days, reserved pending days, and available balances. |
| `GET` | `/api/leaves/my` | Authenticated | Lists authenticated faculty member's leave requests with optional status filter (`status=Pending\|Approved\|Rejected\|Cancelled`). |
| `POST` | `/api/leaves` | Authenticated | Submits a new leave request. Atomically validates entitlement and reserves pending days via row-locking transaction. |
| `GET` | `/api/leaves/calculate` | Authenticated | Computes effective working days duration excluding Sundays based on institutional date policy. |
| `GET` | `/api/leaves/approvals` | HOD Scope | Lists departmental leave requests awaiting decision in the HOD's assigned department. |
| `GET` | `/api/leaves/department-summary` | HOD Scope | Returns departmental leave metrics (pending, approved, rejected, on-leave-today) and recent leaves. |
| `GET` | `/api/leaves/:id` | Scoped Auth | Retrieves detailed leave request record with approver info and decision notes (Requester, HOD, or Admin). |
| `POST` | `/api/leaves/:id/decision` | HOD Scope | HOD approves or rejects departmental leave. Applies atomic balance deduction or reservation release. Self-approval strictly forbidden. |
| `POST` | `/api/leaves/:id/cancel` | Requester Scope | Cancels an eligible pending or approved request. Atomically restores reserved or used leave balances. |
| `POST` | `/api/leaves/policies` | System Admin | Creates or updates institutional leave types and default quotas. |
| `POST` | `/api/leaves/adjust-balance` | System Admin | Manually adjusts faculty leave balance with recorded audit trail reason. |

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

# Email Notifications (Phase 7)
EMAIL_ENABLED=false
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
SMTP_FROM="Faculty Flow <noreply@facultyflow.local>"

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

# Run all automated tests (141 tests total: 127 server, 14 client across 17 test suites)
npm run test

# Run backend test suites (Supertest + Vitest - 10 suites, 127 tests)
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

## 🏖️ Leave Management: Concurrency, Balance Reservation & State Machine (Phase 6)

### 1. State Machine & Transitions
Leave requests strictly follow a directional finite state machine:
```text
           [ Submit Request ]
                   │
                   ▼
               ┌───────┐
               │Pending│
               └───┬───┘
         ┌─────────┴─────────┐
         ▼                   ▼
    ┌────────┐          ┌────────┐
    │Approved│          │Rejected│
    └───┬────┘          └────────┘
        │
        ▼ (Eligible Cancel)
   ┌─────────┐
   │Cancelled│
   └─────────┘
```
- **`Pending` $\rightarrow$ `Approved`**: HOD approves within their authorized department. Decrements `pending_days` and increments `used_days`.
- **`Pending` $\rightarrow$ `Rejected`**: HOD rejects within their authorized department. Releases `pending_days` reservation.
- **`Pending` $\rightarrow$ `Cancelled`**: Requester cancels their pending request. Releases `pending_days` reservation.
- **`Approved` $\rightarrow$ `Cancelled`**: Requester cancels an approved future/ongoing request. Restores `used_days` to available balance.
- **Terminal States**: `Rejected` and `Cancelled` cannot transition to any other status.
- **Direct Status Bypasses**: Blocked. Server returns `400 Bad Request` or `403 Forbidden` for invalid or duplicate transitions.

### 2. Transaction Safety & Concurrency Control
- **Atomic Row-Locking**: All operations modifying leave balances (`POST /api/leaves`, `POST /api/leaves/:id/decision`, `POST /api/leaves/:id/cancel`) execute within MySQL transactions using `SELECT ... FOR UPDATE` on the specific `leave_balances` row.
- **Race Condition Prevention**: Concurrent requests competing for the same entitlement quota cannot overspend. The first transaction commits its reservation, and the competing transaction reads the updated `pending_days` and `used_days`, failing cleanly with `400 Bad Request: Insufficient leave balance` if the quota is exceeded.
- **Idempotent Transitions**: If a decision or cancellation is submitted more than once, subsequent requests fail because the request is no longer in the required prerequisite status, preventing duplicate balance subtractions or restorations.
- **Audit Logging**: Every balance adjustment writes an immutable record to `leave_audit_logs` tracking previous and new balance quantities, reason, and actor ID.

### 3. Institutional Policy Assumptions & Date Calculations
- **Configurable Leave Quotas (Default 2026-2027)**:
  - `CASUAL`: 12.0 days/year (Paid, supports half-day).
  - `SICK`: 10.0 days/year (Paid, supports half-day).
  - `EARNED`: 15.0 days/year (Paid, supports half-day).
  - `UNPAID` (Leave Without Pay): 0.0 days baseline quota (Unpaid, unlimited, never decrements paid entitlements).
- **Duration Calculation**: Working days are calculated inclusively from `start_date` to `end_date`, excluding Sundays by default institutional academic policy.
- **Half-Day Support**: If `is_half_day` is true, `start_date` and `end_date` must match, and the request is counted as exactly `0.5` days (`First Half` or `Second Half`).
- **Indian Date Representation**: The React frontend and API serialize and format dates consistently for `Asia/Kolkata` using the Indian date format (e.g. `22 October 2026`).

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

### 8. Faculty Leave Management (Phase 6)
1. **Leave Balances & Dynamic Indian Date Preview**:
   - Log in as Assistant Professor `asst.cs@facultyflow.local`.
   - Navigate to the **Leaves** tab.
   - Observe Leave Balance cards: Casual (12.0 days), Sick (10.0 days), Earned (15.0 days), Unpaid (0.0 days).
   - Click **Apply for Leave**.
   - Select leave type `Casual Leave`, choose start date `2026-11-10` and end date `2026-11-11`. Observe the computed duration preview displaying `2 working day(s) (Sundays excluded by institutional policy)` and dates formatted in Indian style (`10 November 2026`).
   - Enter reason `Attending international symposium on distributed systems` (min 5 characters) and submit.
   - Observe success notification. The Casual Leave card now reflects `1 pending day(s) reserved`, and available days drop from `12.0` to `10.0`.
2. **Half-Day Leave Option**:
   - Open **Apply for Leave** modal again.
   - Toggle **Request Half-Day Leave**. Notice the end date field is automatically hidden and locked to start date.
   - Select **First Half (Morning)** period, enter date `2026-11-16`, enter reason `Morning hospital consultation`, and submit.
   - Observe the new row in My Leave History displaying `Half-Day (First Half)` badge and `0.5 days` duration.
3. **HOD Approval Queue & Decision Flow**:
   - Log in as Head of Department `hod.cs@facultyflow.local`.
   - Navigate to the **Leaves** tab.
   - Observe Department Leave Overview metrics: `Awaiting Approval: 2`.
   - Click the **Approval Queue (2)** sub-tab.
   - View pending requests from `Claude Shannon` (`asst.cs@facultyflow.local`).
   - Click **Approve** on the 2-day symposium request. The confirmation modal displays requester and dates.
   - Enter decision notes: `Approved. Teaching coverage confirmed.` Click **Confirm Approved**.
   - The queue updates immediately to `1 pending request`.
4. **Enforcement: HOD Self-Approval Prevention**:
   - As `hod.cs@facultyflow.local`, switch to **My Leave History** and submit a leave request for yourself.
   - Observe the request appears in your personal history as `Pending`.
   - Switch to the **Approval Queue**: Verify your own request is excluded from the queue. Direct API calls to `POST /api/leaves/:id/decision` for your own request return `403 Forbidden: HODs cannot approve their own leave requests`.
5. **Enforcement: Cross-Department Isolation**:
   - Log in as Mechanical Engineering HOD `hod.mech@facultyflow.local`.
   - Navigate to the **Leaves** tab. Verify that pending requests from Computer Science faculty are invisible.
   - Attempt to approve CS request `POST /api/leaves/<cs_request_id>/decision` via API -> Server returns `403 Forbidden: You can only decide leave requests within your department`.
6. **Enforcement: Role Boundary Constraints**:
   - Log in as Professor `prof.cs@facultyflow.local`.
   - Verify that the **Approval Queue** tab is completely hidden.
   - Direct API attempts to access `/api/leaves/approvals` or decide requests return `403 Forbidden: Only the Head of Department (HOD) can review and decide leave requests`.
7. **Enforcement: System Admin Workflow Boundary**:
   - Log in as `admin@facultyflow.local`.
   - Attempt to approve a departmental leave request directly -> Returns `403 Forbidden: Only the Head of Department (HOD) can review and decide leave requests`.
   - System Admin can manage leave policy quotas via `/api/leaves/policies` and record manual balance adjustments with audit justification via `/api/leaves/adjust-balance`.
8. **Leave Cancellation & Automatic Balance Restoration**:
   - Log in as `asst.cs@facultyflow.local`.
   - In **My Leave History**, locate the approved 2-day request.
   - Click **Cancel**, enter cancellation note `Symposium postponed by organizers`, and confirm.
   - Status updates to `Cancelled`. Observe that the 2 used days are immediately restored to the available Casual Leave balance.
9. **Unpaid Leave (LWP) Non-Deduction**:
   - Apply for `Unpaid Leave (LWP)` for 3 days.
   - Observe that paid Casual, Sick, and Earned leave balances remain unchanged.

---

## 📧 Email Notification Service & Background Queue (Phase 7)

### 1. Notification Architecture & Modular Transport Abstraction

Faculty Flow 2.0 implements a modular, server-side notification service designed to keep email delivery strictly non-blocking and decoupled from core business transactions.

```text
  ┌─────────────────────────────────────────────────────────┐
  │                 Business Action Trigger                 │
  │   (Task Assignment, Leave Decision, Event, Handover)    │
  └────────────────────────────┬────────────────────────────┘
                               │ (Atomically within MySQL Transaction)
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │         Durable Queue: `email_notifications`            │
  │     (Pending | Processing | Sent | Failed)              │
  └────────────────────────────┬────────────────────────────┘
                               │ (Asynchronous Polling & Lease Locking)
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │      NotificationWorker (Bounded Batch Concurrency)     │
  └────────────────────────────┬────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ SmtpTransport    │  │ DevEmailTransport│  │ MockTransport    │
│ (Nodemailer TLS) │  │ (Safe Local Log) │  │ (In-Memory Tests)│
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

- **Modular Transport Interface (`EmailTransport`)**: The notification subsystem is decoupled behind an `EmailTransport` contract (`sendMail({ to, toName, subject, html, text })`). This allows swapping SMTP for providers such as AWS SES, SendGrid, or Resend without touching any domain controller or event enqueueing code.
- **Transports Provided**:
  - `SmtpEmailTransport`: Maintained Nodemailer transport reading validated SMTP host, port, credentials, TLS settings, and sender address.
  - `DevEmailTransport`: Default fallback for local development when `EMAIL_ENABLED=false` or SMTP is unconfigured. Generates sanitized log previews with masked email addresses (`j***e@domain.com`) and plain-text summaries without performing external network calls or leaking credentials.
  - `MockEmailTransport`: Programmatic test double used in automated test suites with zero external network dependencies and built-in failure simulation.
- **Fail-Safe Startup**: If `EMAIL_ENABLED=true` but SMTP credentials or host configuration are invalid, the server fails loudly at startup with a descriptive environment validation error (`validateEnv`), preventing silent delivery failures in production.
- **Centralized Email Templates**: All 14 system notifications use standardized responsive HTML templates with academic branding and plain-text alternatives. All user-controlled fields (task titles, attendee names, notes, reasons) are strictly entity-escaped (`escapeHtml`) before HTML interpolation to eliminate Cross-Site Scripting (XSS). SMTP headers are stripped of CRLF characters (`sanitizeHeader`) to prevent header injection.

---

### 2. Notification Event Coverage & Recipient Policy

| Domain | Event Type | Trigger Action | Intended Recipient | Idempotency Key Pattern | Department & Privacy Isolation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Tasks** | `TASK_ASSIGNED` | Task created or delegated | Assignee faculty member | `task-assigned-${taskId}-${assigneeId}` | Only within permitted departmental allocation boundaries. |
| **Tasks** | `TASK_UPDATED` | Task title, priority, due date, or category updated | Assignee faculty member | `task-updated-${taskId}-${updateTimestamp}` | Only assignee receives notification; department-isolated. |
| **Tasks** | `TASK_REASSIGNED` | Task reassigned to another faculty member | New assignee faculty member | `task-reassigned-${taskId}-${newAssigneeId}-${timestamp}` | New assignee notified; previous assignee record updated cleanly. |
| **Tasks** | `TASK_CANCELLED` | Task deleted by authorized creator or HOD | Assigned faculty member | `task-cancelled-${taskId}-${assigneeId}` | Assignee notified of cancellation; unassigned tasks skip email. |
| **Leaves** | `LEAVE_SUBMITTED` | Faculty submits leave request | Requester faculty member | `leave-submit-ack-${leaveId}-${requesterId}` | Submission acknowledgement sent to requester only. |
| **Leaves** | `LEAVE_PENDING_APPROVAL` | Faculty submits leave request | Department Head (HOD) | `leave-hod-queue-${leaveId}-${hodId}` | Routed strictly to HOD of requester's department. |
| **Leaves** | `LEAVE_APPROVED` | HOD approves leave request | Requester faculty member | `leave-decision-${leaveId}-Approved` | Notification includes approved dates and HOD notes. |
| **Leaves** | `LEAVE_REJECTED` | HOD rejects leave request | Requester faculty member | `leave-decision-${leaveId}-Rejected` | Notification includes rejected dates and mandatory reason. |
| **Leaves** | `LEAVE_CANCELLED` | Requester cancels eligible leave | Requester faculty member | `leave-cancelled-${leaveId}-${requesterId}` | Cancellation confirmation sent to requester. |
| **Calendar** | `EVENT_INVITATION` | Academic event scheduled with attendees | Each invited faculty member | `event-invite-${eventId}-${participantUserId}` | Sent individually to invited participants in department. |
| **Calendar** | `EVENT_UPDATED` | Event date, time, or location materially changed | All invited/accepted attendees | `event-updated-${eventId}-${attendeeId}-${timestamp}` | Broadcast individually to affected attendees; no cross-recipient leakage. |
| **Calendar** | `EVENT_CANCELLED` | Academic event deleted by creator or HOD | All invited/accepted attendees | `event-cancelled-${eventId}-${attendeeId}` | Broadcast individually to attendees regarding cancellation. |
| **Handovers** | `HANDOVER_CREATED` | Faculty initiates academic handover | Designated recipient faculty | `handover-created-${handoverId}-${recipientId}` | Recipient receives context, deadline, and task details. |
| **Handovers** | `HANDOVER_STATUS_UPDATED` | Handover accepted, rejected, or completed | Originating sender faculty | `handover-status-${handoverId}-${status}` | Sender notified of progress (Accepted, Rejected, Completed). |

---

### 3. Queue Schema, Idempotency & Transaction Safety

1. **Transactional Enqueueing**:
   - Notifications are enqueued within the *same* MySQL transaction as the business operation (`connection: PoolConnection` passed to `enqueueNotification`).
   - If a business transaction fails or rolls back, the notification entry is discarded atomically.
   - **Emails are never sent before the business transaction is committed to disk.**
2. **Deterministic Idempotency**:
   - `idempotency_key` has a `UNIQUE` constraint (`uq_email_notif_idempotency`).
   - Insertion uses `INSERT IGNORE INTO email_notifications`, ensuring retried HTTP requests, network hiccups, or duplicate controller invocations do not produce duplicate emails.
3. **Queue State Transitions**:
   ```text
   [ Enqueue ] ──► (Pending) ──► (Processing) ──► (Sent)
                       ▲              │
                       │              ▼
                       └─── (Retry) ◄─┴─────────► (Failed)
   ```
   - **`Pending`**: Waiting for worker poll.
   - **`Processing`**: Leased by an active worker (`locked_at`, `locked_by`).
   - **`Sent`**: Successfully dispatched via transport (`sent_at` recorded).
   - **`Failed`**: Reached maximum retry attempts (`max_attempts = 5`). Retains sanitized `error_summary`.

---

### 4. Background Worker Lifecycle, Concurrency & Lease Recovery

The `NotificationWorker` manages resilient background email delivery:

- **Startup & Concurrency**:
  - Automatically started during server boot in non-test environments (`notificationWorker.start()`).
  - Configurable polling interval (default: `5000ms`) and batch size (default: `10` jobs).
  - Bounded concurrency ensures SMTP servers are not flooded.
- **Atomic Row-Locking**:
  - Uses `SELECT id FROM email_notifications WHERE status = 'Pending' ... FOR UPDATE` followed by atomic batch locking:
    `UPDATE email_notifications SET status = 'Processing', locked_at = NOW(), locked_by = ? WHERE id IN (...)`
  - Multiple worker instances running concurrently across clustered servers will never process the same email job twice.
- **Exponential Backoff Retry**:
  - On delivery failure, jobs are rescheduled with exponential backoff:
    `next_retry_at = NOW() + INTERVAL (attempts * attempts * 30) SECOND`
    - Attempt 1: +30 seconds
    - Attempt 2: +120 seconds (2 mins)
    - Attempt 3: +270 seconds (4.5 mins)
    - Attempt 4: +480 seconds (8 mins)
    - Attempt 5: Exceeds `max_attempts` $\rightarrow$ Marked as `Failed`.
- **Lease Timeout & Crash Recovery**:
  - If a worker crashes or encounters an unhandled exception while holding a job in `Processing`, `recoverStaleJobs()` automatically reclaims any job where `locked_at < NOW() - INTERVAL 5 MINUTE` and resets its status to `Pending`.
- **Graceful Shutdown**:
  - Traps `SIGINT` and `SIGTERM` signals via `notificationWorker.stop()`.
  - Clears active polling timers, waits for currently running job dispatches to settle, and releases database connections cleanly.

---

### 5. Environment Configuration & Local Development

#### Required Environment Variables (`server/.env`)

```env
# Email Notification Configuration
EMAIL_ENABLED=false
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=safe_placeholder_user
SMTP_PASS=safe_placeholder_pass
SMTP_FROM="Faculty Flow <no-reply@facultyflow.local>"
```

#### Local Development Behavior
- When `EMAIL_ENABLED=false` (the default in `.env.example`):
  - The application and database queue run normally.
  - Notifications are enqueued and processed by `DevEmailTransport`.
  - Sanitized previews are logged to the console showing event type, subject, and masked recipient address (`a***t@facultyflow.local`).
  - **No external network connections or SMTP credentials are required.**

#### Configuring an SMTP Provider (Without Committing Credentials)
1. Copy `.env.example` to `server/.env` (which is excluded from Git via `.gitignore`).
2. Set `EMAIL_ENABLED=true`.
3. Fill in your SMTP relay credentials (e.g., Mailtrap, SendGrid, Amazon SES SMTP, or institutional mail gateway):
   - `SMTP_HOST=smtp.sendgrid.net`
   - `SMTP_PORT=587`
   - `SMTP_SECURE=false`
   - `SMTP_USER=apikey`
   - `SMTP_PASS=your_actual_api_key_here`
   - `SMTP_FROM="Faculty Flow <notifications@yourinstitution.edu>"`
4. Start the backend: `npm run dev:server`.
5. **Never commit `.env` or credentials to version control.**

> [!WARNING]
> **Production Notice**: Production email delivery requires an authorized, valid SMTP host (e.g. an institutional relay or transactional email provider) and a verified end-to-end integration test. Do not claim that production email delivery works without an authorized SMTP configuration.

---

### 6. Safe Automated Testing Runbook

Automated tests for notifications and queue workers use `MockEmailTransport` or `DevEmailTransport` to guarantee that **no real emails are ever sent during tests**.

#### Test Scope (`server/test/notifications.test.ts`):
- HTML entity escaping and XSS injection defense (`escapeHtml`).
- SMTP header injection prevention (`sanitizeHeader`).
- Credential and token redaction in logs (`sanitizeErrorMessage`).
- Template rendering for all 14 domain events with fallback plain text.
- Development mode preview logging (`DevEmailTransport`).
- Validation failure when SMTP is enabled with invalid settings.
- Transactional enqueueing and rollback atomicity.
- Idempotency key deduplication (`INSERT IGNORE`).
- Background worker execution, atomic locking, and status transitions.
- Transient delivery failure and exponential backoff scheduling.
- Permanent failure handling upon exceeding `max_attempts`.
- Worker crash recovery (`recoverStaleJobs`).
- Concurrent worker processing safety without collisions.
- Clean worker shutdown.
- Controller event integrations (Tasks, Leaves, Calendar Events, Handovers).
- Department isolation and permission boundary enforcement.

#### Run Test Suites Safely
```bash
# Run notification unit and integration test suite
npm run test:server -- server/test/notifications.test.ts

# Run entire backend test suite (127 tests across 10 test suites)
npm run test:server

# Run entire fullstack test suite (141 tests across 17 test suites)
npm run test
```

---

### 7. Production Operational Considerations

#### Queue Monitoring Queries
System administrators and DevOps engineers can monitor queue health using standard SQL queries:

```sql
-- 1. Check current queue backlog by status
SELECT status, COUNT(*) AS count
FROM email_notifications
GROUP BY status;

-- 2. Inspect failing or dead-letter notifications
SELECT id, event_type, recipient_email, attempts, max_attempts, next_retry_at, error_summary, created_at
FROM email_notifications
WHERE status = 'Failed'
ORDER BY created_at DESC
LIMIT 50;

-- 3. Check for stale jobs currently locked by workers
SELECT id, event_type, locked_by, locked_at, TIMESTAMPDIFF(MINUTE, locked_at, NOW()) AS locked_minutes_ago
FROM email_notifications
WHERE status = 'Processing'
ORDER BY locked_at ASC;
```

#### Queue Maintenance & Purging
To prevent unbounded table growth in high-volume environments, configure a recurring maintenance cron job:

```sql
-- Purge successfully sent notifications older than 60 days
DELETE FROM email_notifications
WHERE status = 'Sent' AND sent_at < NOW() - INTERVAL 60 DAY;

-- Purge permanently failed notifications older than 90 days after review
DELETE FROM email_notifications
WHERE status = 'Failed' AND updated_at < NOW() - INTERVAL 90 DAY;
```

#### Credential Rotation
When rotating SMTP passwords or API keys:
1. Update secrets in your production secrets manager / environment configuration.
2. Trigger a graceful restart of the server instances.
3. Because credentials are read directly from process environment variables and never persisted to the database or cached on disk, rotated credentials take effect immediately upon reboot with zero queue loss.

---

## Phase 8: Integration, Security, and Regression Hardening

Phase 8 hardens system integration, concurrency, transactional integrity, notification idempotency, and security across Faculty Flow 2.0.

### 1. Business Versioning & Event Idempotency
- **Migration `008_business_versioning_and_idempotency.sql`**:
  - Adds `version INT NOT NULL DEFAULT 1` to `tasks` and `academic_events`.
  - Distinguishes duplicate retries of a single event from legitimate subsequent updates on the same record.
  - Initial creation and first updates retain backwards-compatible keys (e.g. `task-assigned-${taskId}-${assigneeId}` and `task-updated-${taskId}-${assigneeId}`).
  - Subsequent updates increment record versions (`version = version + 1`) and produce versioned keys (`task-updated-${taskId}-${assigneeId}-v${version}`).
  - Client-supplied `Idempotency-Key` or `X-Idempotency-Key` headers are fully supported across task, leave, event, and handover routes.
  - Updates with no change payloads act as no-ops without creating redundant emails.

### 2. Transactional Queue Coupling
- Notification enqueuing is transactionally coupled to business changes:
  - `task.controller.ts` (`createTask`, `updateTask`, `reassignTask`, `deleteTask`)
  - `handover.controller.ts` (`createHandover`, `updateHandoverStatus`)
  - `event.controller.ts` (`createEvent`, `updateEvent`, `deleteEvent`)
  - `leave.controller.ts` (`submitLeaveRequest`, `decideLeaveRequest`, `cancelLeaveRequest`)
- Database connection rollbacks leave zero orphaned notifications in `email_notifications`.
- Physical file unlinking (e.g. deleted event PDFs) occurs only after the database transaction commits.

### 3. Worker Concurrency & Lease Safety
- **Per-Job Lease Renewal**: Workers touch `locked_at = NOW()` per job during batch processing to prevent slow SMTP calls from colliding with the 5-minute stale-job recovery window.
- **Conditional Update Guards**: All status transitions (`Sent`, `Failed`, retry rescheduling) verify `WHERE id = ? AND locked_by = ?` to ensure late workers never overwrite reclaimed jobs.
- **Transport Timeouts**: `SmtpEmailTransport` explicitly enforces `connectionTimeout: 15000`, `greetingTimeout: 10000`, and `socketTimeout: 20000`.

### 4. Security Hardening & Administrative Safeguards
- **HTTP Security Headers**: Express middleware emits `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 0`, and `Referrer-Policy: strict-origin-when-cross-origin`.
- **Bounded Request Limits**: Enforced 1MB request body parsing limits.
- **Rate Limiting**: `POST /api/auth/change-password` enforces strict rate limiting (max 5 failed attempts within 15 minutes before 15-minute lockouts).
- **Admin Self-Protection**: System Administrators are prohibited from demoting their own role (`CANNOT_DEMOTE_SELF`) or deactivating their own account (`CANNOT_DEACTIVATE_SELF`).

### 5. Verification & Test Metrics
- **Test Results**: 153 tests passed across 18 test suites (139 server tests in 11 suites, 14 client tests in 7 suites).
- **Typecheck**: Clean pass with 0 errors (`tsc --noEmit` across both workspaces).
- **Build**: Clean pass (`vite build` client bundle + `tsc` server build).
- **Production Dependencies**: 0 vulnerabilities (`npm audit --omit=dev`).

---

## Phase 9: Deployment Preparation, Production Configuration, and Operations

Phase 9 establishes deployment readiness, startup environment validation, fresh database provisioning verification, production container definitions, and comprehensive operations documentation.

### 1. Production Configuration & Startup Safeguards
- **Environment Validation**: `server/src/config/env.ts` enforces high-entropy secrets in production (`NODE_ENV=production`). Defaults like `faculty_flow_default_dev_secret_change_in_production` fail fast on boot. Secrets must be at least 32 characters.
- **Production Seeding Guard**: `server/src/db/seed.ts` strictly prohibits execution in production environments (`NODE_ENV=production`), preventing accidental insertion of development accounts.
- **CORS Domain Lockdown**: In production, CORS origins are locked strictly to `env.CLIENT_URL`, disallowing `localhost` and `127.0.0.1`.
- **Persistent Storage Configuration**: `EVENT_UPLOAD_DIR` environment variable allows configurable volume mounts for private event PDF storage.

### 2. Database & Migration Provisioning Verification
- **Clean Database Test (`server/test/migration.test.ts`)**:
  - Automatically provisions disposable test database `faculty_flow_phase9_clean_test_db`.
  - Confirms zero initial application tables.
  - Applies migrations `001` through `008` in strict numerical order.
  - Verifies all 16 application tables, schema constraints, foreign keys, and indexes.
  - Re-runs the migration check on the applied database, confirming runner idempotency (0 reapplied).
  - Verifies failure handling for invalid connection parameters.
  - Cleans up the disposable database post-verification.

### 3. Container & Deployment Manifests
- **Multi-Stage `Dockerfile`**: Production build with Node.js 20 Alpine, multi-stage compilation, unprivileged non-root user (`node`), and built-in `/api/health` container healthcheck.
- **`docker-compose.yml`**: Out-of-the-box staging/production service definitions for MySQL 8.0 and Faculty Flow application with persistent named volumes for data and private uploads.
- **Comprehensive Guide (`DEPLOYMENT.md`)**: Full operational guide covering VM/systemd, reverse proxy (Nginx/Caddy), least-privilege MySQL provisioning, backups/disaster recovery, and credential rotation.

### 4. Production Readiness Summary
- **Test Suite**: 155 tests passed across 19 test suites (141 server tests in 12 suites, 14 client tests in 7 suites).
- **Typecheck**: 0 errors across server and client workspaces.
- **Production Build**: Clean pass for server (`tsc`) and client (`vite build`).
- **Production Dependencies**: 0 vulnerabilities via `npm audit --omit=dev`.
- **Dedicated Guide**: See [DEPLOYMENT.md](file:///c:/Users/bgaur/faculty_flow/DEPLOYMENT.md) for full deployment instructions and the production readiness checklist.




