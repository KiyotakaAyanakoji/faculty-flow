# Faculty Flow 2.0

> Modern Academic Operations & Faculty Management System — Foundation Layer (Phase 1)

Faculty Flow 2.0 is an enterprise-grade academic operations platform designed for higher education institutions. This repository contains the project foundation, establishing a modular, decoupled full-stack architecture with React (Vite + TypeScript), Node.js (Express + TypeScript), and MySQL.

---

## 🏗️ Architecture Overview

The codebase is organized into a modular monorepo workspace:

```text
faculty_flow/
├── client/                     # Frontend Application
│   ├── src/
│   │   ├── components/         # Reusable UI components (HealthCard, etc.)
│   │   ├── test/               # Vitest + RTL frontend test suites
│   │   ├── App.tsx             # Root layout and architectural overview
│   │   ├── index.css           # Vanilla CSS tokens & design system
│   │   └── main.tsx            # Application entry point
│   ├── .env.example            # Client environment template
│   ├── index.html              # HTML shell with typography and SEO metadata
│   ├── package.json            # Client dependencies and scripts
│   ├── tsconfig.json           # Client TypeScript configuration
│   └── vite.config.ts          # Vite build, proxy, and test config
│
├── server/                     # Backend API Application
│   ├── src/
│   │   ├── config/             # Environment validation (Zod) & MySQL pool
│   │   ├── controllers/        # Express route controllers (Health, etc.)
│   │   ├── db/                 # Migration runner and SQL schemas
│   │   ├── middleware/         # Centralized error handler & 404 handler
│   │   ├── routes/             # Modular API router definitions
│   │   ├── app.ts              # Express application factory
│   │   └── index.ts            # Server bootstrap and graceful shutdown
│   ├── test/                   # Vitest + Supertest backend test suites
│   ├── .env.example            # Server environment template
│   ├── package.json            # Server dependencies and scripts
│   └── tsconfig.json           # Server TypeScript configuration
│
├── .env.example                # Root environment template
├── .gitignore                  # Comprehensive gitignore rules
├── package.json                # Root workspaces orchestrator
└── README.md                   # System documentation and runbook
```

---

## 📋 Prerequisites

Before running the project, ensure you have the following installed on your machine:

- **Node.js**: `v20.x` or higher (tested with Node `v26.x`)
- **npm**: `v10.x` or higher (or equivalent package manager)
- **MySQL**: `v8.0` or higher (optional for basic frontend/backend smoke testing, required for DB operations)
- **Git**

---

## 🚀 Installation

Install all dependencies across both `client` and `server` workspaces in a single command from the project root:

```bash
npm install
```

> **Note for Windows PowerShell Users:** If PowerShell script execution policies block `npm`, run commands using `npm.cmd` (e.g., `npm.cmd install`).

---

## ⚙️ Environment Configuration

1. Copy the root environment template or the respective templates in `client/` and `server/`:

```bash
# Server configuration
cp server/.env.example server/.env

# Client configuration
cp client/.env.example client/.env
```

2. Review and adjust environment values:

### Server Variables (`server/.env`)
| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `5000` | Port on which the Express server listens |
| `NODE_ENV` | `development` | Runtime environment (`development`, `production`, `test`) |
| `CLIENT_URL` | `http://localhost:5173` | Allowed frontend origin for CORS |
| `DB_HOST` | `localhost` | MySQL host address |
| `DB_PORT` | `3306` | MySQL port |
| `DB_USER` | `root` | MySQL database user |
| `DB_PASSWORD` | *(empty)* | MySQL database password |
| `DB_NAME` | `faculty_flow_db` | MySQL database name |
| `DB_CONNECTION_LIMIT`| `10` | Max simultaneous connections in pool |

### Client Variables (`client/.env`)
| Variable | Default | Description |
| :--- | :--- | :--- |
| `VITE_API_URL` | `http://localhost:5000/api` | Base URL for API calls |

---

## 🗄️ Database Setup & Migrations

### 1. Create the Database
Connect to your local MySQL instance and create the database:

```sql
CREATE DATABASE IF NOT EXISTS faculty_flow_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Run Database Migrations
Execute the automated transactional migration runner:

```bash
# From the project root:
npm run db:migrate

# Or specifically inside the server workspace:
npm run db:migrate --workspace=server
```

This creates the `schema_migrations` tracking table and applies baseline tables (e.g., `system_info`).

---

## 💻 Development Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts **both** Express backend and Vite frontend concurrently |
| `npm run dev:server` | Starts the Express server in watch mode using `tsx` |
| `npm run dev:client` | Starts the Vite development server with Hot Module Replacement (HMR) |
| `npm run build` | Compiles both TypeScript server and Vite frontend production bundles |
| `npm run build:server` | Compiles the server TypeScript to `server/dist/` |
| `npm run build:client` | Compiles the client React app to `client/dist/` |

When running `npm run dev`:
- **Frontend**: Accessible at `http://localhost:5173`
- **Backend API**: Accessible at `http://localhost:5000`
- **Health Check Endpoint**: `http://localhost:5000/api/health`

---

## 🧪 Verification & Testing Commands

To verify project integrity, smoke tests and type checks can be executed:

```bash
# Run all automated tests (client + server)
npm run test

# Run backend smoke tests (Supertest + Vitest)
npm run test:server

# Run frontend smoke tests (React Testing Library + Vitest)
npm run test:client

# Run strict TypeScript validation across the entire project
npm run typecheck
```

---

## 🛡️ API Health Check Endpoint

`GET /api/health` (also accessible at `/health`)

### Response Example:
```json
{
  "status": "ok",
  "service": "Faculty Flow 2.0 API",
  "timestamp": "2026-10-22T05:15:00.000Z",
  "uptime": 12.4,
  "environment": "development",
  "database": {
    "status": "connected",
    "message": "Database connection successful"
  }
}
```

If the database is offline or unreachable, the endpoint returns HTTP 200 with `status: "degraded"` and diagnostic details in the `database` object, ensuring system resilience and seamless frontend status reporting.

---

## 📌 Phase 1 Scope Boundary
This phase establishes the structural, infrastructural, and continuous-verification foundations of Faculty Flow 2.0. Business features (authentication, role-based access, faculty leave workflows, task scheduling, calendars) are scheduled for Phase 2 onward.
