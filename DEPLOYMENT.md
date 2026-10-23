# Faculty Flow 2.0 - Production Deployment & Operations Guide

This guide provides step-by-step instructions for preparing, provisioning, deploying, and operating **Faculty Flow 2.0** in production environments.

---

## 1. System Architecture & Runtime Requirements

### Architecture Overview
Faculty Flow 2.0 is a decoupled, modern web application:
- **Frontend**: React 18 SPA built with Vite and TypeScript, served as static assets via Nginx, Caddy, or an S3/CloudFront/CDN origin.
- **Backend**: Node.js (Express) with TypeScript, stateless REST API listening on `PORT` (default `5000`).
- **Database**: MySQL 8.0+ storing relational records, schema migrations, and durable transactional queues.
- **Background Worker**: In-process or standalone polling worker (`NotificationWorker`) claiming queued jobs with optimistic locking, lease recovery, and exponential backoff retry.
- **Private Storage**: Secure local volume or persistent mount (`EVENT_UPLOAD_DIR`) for academic event PDF attachments, with magic-byte verification and path-traversal prevention.

```
                           +---------------------------+
                           |  Client Web Browsers      |
                           +-------------+-------------+
                                         | HTTPS (443)
                                         v
               +-----------------------------------------------+
               | Reverse Proxy / TLS Termination (Nginx/Caddy) |
               +-------+-------------------------------+-------+
                       | Static Assets                 | Proxy /api
                       v                               v
             +--------------------+         +--------------------+
             | React Frontend     |         | Express REST API   |
             | Static HTML/JS/CSS |         | Node.js Runtime    |
             +--------------------+         +---------+----------+
                                                      |
                                 +--------------------+--------------------+
                                 |                                         |
                                 v                                         v
                      +--------------------+                    +--------------------+
                      | MySQL 8.0+ Database|                    | Persistent Storage |
                      | Relational Data &  |                    | Private PDFs       |
                      | Notification Queue |                    | (EVENT_UPLOAD_DIR) |
                      +--------------------+                    +--------------------+
                                 |
                                 v
                      +--------------------+
                      | SMTP Gateway       |
                      | Institutional Relay|
                      +--------------------+
```

### Supported Runtime & Software Requirements
| Component | Minimum Version | Recommended Version | Notes |
| :--- | :--- | :--- | :--- |
| **Node.js** | `20.18.0 LTS` | `22.x LTS` | Tested on Node.js v20+ and v22+ |
| **NPM** | `10.0.0` | `10.8.2+` | Workspace management support |
| **MySQL** | `8.0.28+` | `8.0.36+` | Requires InnoDB and `utf8mb4` support |
| **Operating System** | Ubuntu 22.04 LTS / Debian 12 / RHEL 9 | Ubuntu 24.04 LTS | Standard POSIX-compliant Linux |
| **Reverse Proxy** | Nginx `1.24+` / Caddy `2.7+` | Nginx `1.26+` | TLS 1.3 termination and gzip/brotli compression |

---

## 2. Environment Variables & Secret Configuration

Environment variables must be supplied via a secure environment management tool (e.g. systemd environment files, Docker secrets, Kubernetes Secrets, AWS Secrets Manager, or HashiCorp Vault). **Never commit production `.env` files to source control.**

### Complete Environment Variable Reference

| Variable | Scope | Required in Prod | Default / Example | Purpose & Constraints |
| :--- | :--- | :---: | :--- | :--- |
| `NODE_ENV` | Server | Yes | `production` | Set to `production`. Disables dev error stacks and disables dev DB seeding. |
| `PORT` | Server | No | `5000` | HTTP port for the Express backend. |
| `CLIENT_URL` | Server | Yes | `https://facultyflow.institution.edu` | Allowed CORS origin. Must match production frontend domain exactly. |
| `DB_HOST` | Server | Yes | `mysql.internal` | Database hostname or private IP address. |
| `DB_PORT` | Server | No | `3306` | MySQL port. |
| `DB_USER` | Server | Yes | `faculty_flow_app` | Dedicated least-privilege application user. |
| `DB_PASSWORD` | Server | Yes | *Secret* | Secure database user password. |
| `DB_NAME` | Server | Yes | `faculty_flow_db` | Target database name. |
| `DB_CONNECTION_LIMIT`| Server | No | `15` | MySQL connection pool size. Set based on server worker concurrency. |
| `JWT_SECRET` | Server | Yes | *Secret (>= 32 chars)* | High-entropy signing secret for short-lived access tokens. |
| `JWT_EXPIRES_IN` | Server | No | `15m` | Access token lifespan (format: `15m`, `30m`). |
| `REFRESH_TOKEN_EXPIRES_IN` | Server | No | `7d` | Refresh token lifespan (format: `7d`). Stored in database with reuse detection. |
| `COOKIE_SECRET` | Server | Yes | *Secret (>= 32 chars)* | Signing secret for HTTP-only cookies. |
| `EVENT_UPLOAD_DIR` | Server | No | `/var/lib/facultyflow/uploads` | Path to private PDF attachments. Must be a persistent volume mount. |
| `EMAIL_ENABLED` | Server | Yes | `true` | Enables real SMTP delivery. When `false`, messages are logged to console. |
| `SMTP_HOST` | Server | If Email On | `smtp.mailgun.org` | Outgoing SMTP mail server hostname. |
| `SMTP_PORT` | Server | If Email On | `587` | Outgoing SMTP port (`587` for STARTTLS, `465` for SSL/TLS). |
| `SMTP_SECURE` | Server | If Email On | `false` | `true` for port 465; `false` for port 587. |
| `SMTP_USER` | Server | If Email On | *Secret* | SMTP relay username. |
| `SMTP_PASS` | Server | If Email On | *Secret* | SMTP relay password. |
| `SMTP_FROM` | Server | If Email On | `"Faculty Flow <noreply@institution.edu>"` | Outgoing RFC 5322 formatted sender string. |
| `VITE_API_URL` | Client | Yes | `/api` | Base API endpoint for Vite build. Use relative `/api` behind reverse proxy. |

### Generating Cryptographic Secrets
Generate 32-byte (256-bit) cryptographically secure random hexadecimal strings for `JWT_SECRET` and `COOKIE_SECRET`:

```bash
# Generate high-entropy secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 3. Database Provisioning & Least-Privilege Setup

### 1. Database Creation
Connect as MySQL root or administrative user:

```sql
CREATE DATABASE faculty_flow_db
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
```

### 2. Least-Privilege Application User
Create a dedicated application user restricted to necessary operational privileges:

```sql
-- Create application user
CREATE USER 'faculty_flow_app'@'%' IDENTIFIED BY 'STRONG_SECRET_PASSWORD_HERE';

-- Grant operational DML and DDL for automated migrations
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, ALTER, REFERENCES, DROP
  ON faculty_flow_db.* TO 'faculty_flow_app'@'%';

FLUSH PRIVILEGES;
```

> **Security Note:** In high-compliance environments with separated migration pipelines, grant `CREATE, ALTER, INDEX, DROP` only to a migration runner service account, and restrict the runtime application account to `SELECT, INSERT, UPDATE, DELETE`.

### 3. Running Production Migrations
Run the migration script to apply all migrations (`001` through `008`) in sequential order:

```bash
# From repository root
npm run db:migrate
```

Verification check:
```bash
# Verify migrations applied
mysql -u faculty_flow_app -p -h DB_HOST faculty_flow_db -e "SELECT version, applied_at FROM schema_migrations ORDER BY id ASC;"
```

---

## 4. Persistent Document & Upload Storage

Faculty Flow 2.0 allows faculty to upload and attach academic event schedules and agendas in PDF format.

### Storage Architecture
1. **Private by Default**: Files are stored on a local or mounted filesystem path (`EVENT_UPLOAD_DIR`). Files are **never** placed within a public web directory.
2. **Path Traversal Protection**: File identifiers are verified with `path.basename()` and directory prefix validation.
3. **MIME & Magic Bytes**: Files are verified using `%PDF-` binary magic bytes prior to persistence.
4. **Authorization Enforcement**: Download requests (`GET /api/events/:id/documents/:docId/download`) require valid JWT authentication, active user status, and department isolation verification.

### Production Storage Mounting
- **Ephemeral Container Warning**: If deploying on AWS ECS, GCP Cloud Run, Kubernetes, or Heroku, the default container disk is ephemeral. You must mount a persistent volume (e.g. AWS EFS, GCP Persistent Disk, Azure Files, or an NFS mount) and set `EVENT_UPLOAD_DIR=/mnt/facultyflow_storage`.
- **Permissions**: Ensure the Node.js process user (`node` / `facultyflow`) has `rwX` permissions on the storage mount:
  ```bash
  mkdir -p /var/lib/facultyflow/uploads
  chown -R facultyflow:facultyflow /var/lib/facultyflow/uploads
  chmod 700 /var/lib/facultyflow/uploads
  ```

---

## 5. Email Worker & Notification Operations

The background email queue worker (`NotificationWorker`) runs continuously, processing jobs from the `email_notifications` table.

### Operational Features
- **Transaction Coupling**: Emails are inserted within the same database transaction as business operations. If an operation fails, the notification is rolled back.
- **Idempotency**: Every job has a unique `idempotency_key` (including record version numbers). Duplicate submissions are ignored.
- **Lease Safety**: Jobs are claimed with an exclusive lease (`locked_by` and `locked_at`). The lease timestamp is touched per job to prevent slow SMTP calls from colliding with the 5-minute stale-job recovery window.
- **Retry & Dead Letter**: Failed deliveries undergo exponential backoff (up to 5 attempts). After 5 attempts, jobs are marked `Failed` without rolling back committed business data.

### Queue Health Monitoring Queries
Run periodically to check queue health:

```sql
-- 1. Status overview
SELECT status, COUNT(*) AS count
FROM email_notifications
GROUP BY status;

-- 2. Dead-letter inspection
SELECT id, event_type, recipient_email, attempts, error_message, updated_at
FROM email_notifications
WHERE status = 'Failed'
ORDER BY updated_at DESC
LIMIT 20;

-- 3. Stuck/in-flight jobs
SELECT id, event_type, locked_by, locked_at, TIMESTAMPDIFF(MINUTE, locked_at, NOW()) AS locked_minutes_ago
FROM email_notifications
WHERE status = 'Processing';
```

---

## 6. Build & Deployment Procedures

### Procedure A: Systemd & PM2 on Virtual Machine (Bare-Metal / VPS)

#### 1. Clone & Build
```bash
# Clone release tag or main branch
git clone https://github.com/KiyotakaAyanakoji/faculty-flow.git /opt/facultyflow
cd /opt/facultyflow

# Clean dependency installation
npm ci

# Typecheck and build both workspaces
npm run typecheck
npm run build

# Run migrations
npm run db:migrate
```

#### 2. Systemd Service Definition (`/etc/systemd/system/facultyflow.service`)
```ini
[Unit]
Description=Faculty Flow 2.0 Backend Service
After=network.target mysql.service

[Service]
Type=simple
User=facultyflow
WorkingDirectory=/opt/facultyflow/server
EnvironmentFile=/etc/facultyflow/server.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=facultyflow

# Security Sandboxing
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable facultyflow
sudo systemctl start facultyflow
sudo systemctl status facultyflow
```

#### 3. Nginx Reverse Proxy & Static Hosting (`/etc/nginx/sites-available/facultyflow.conf`)
```nginx
server {
    listen 80;
    server_name facultyflow.institution.edu;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name facultyflow.institution.edu;

    ssl_certificate /etc/letsencrypt/live/facultyflow.institution.edu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/facultyflow.institution.edu/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Frontend Static Files
    root /opt/facultyflow/client/dist;
    index index.html;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Security Headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "0" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Client SPA Routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Upload limit for event PDFs
        client_max_body_size 10M;
    }
}
```

---

## 7. Operational Health Checks & Monitoring

### Health API Endpoint
The backend exposes a public health check:
- **Endpoint**: `GET /api/health`
- **Response Format**:
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-10-23T04:30:00.000Z",
    "uptime": 86400,
    "environment": "production",
    "database": {
      "isConnected": true,
      "message": "Database connection successful",
      "database": "faculty_flow_db"
    }
  }
  ```
- **Load Balancer Configuration**: Point HTTP health probes to `/api/health` with a 10s interval and 3s timeout. A 200 HTTP response confirms both Express and MySQL connectivity.

---

## 8. Backup, Restore, and Disaster Recovery

### Database Backups
Schedule daily automated backups with `mysqldump`:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/facultyflow"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="$BACKUP_DIR/facultyflow_db_$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

mysqldump --single-transaction --quick --routines --triggers \
  -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" | gzip > "$FILENAME"

# Retain backups for 30 days
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +30 -delete
```

### Document Storage Backups
Synchronize the persistent PDF directory to encrypted off-site object storage:
```bash
rsync -avz --delete /var/lib/facultyflow/uploads/ /var/backups/facultyflow/uploads/
```

### Disaster Recovery / Database Restore
```bash
# Decompress and restore database
gunzip < /var/backups/facultyflow/facultyflow_db_20261023_000000.sql.gz | mysql -u faculty_flow_app -p -h "$DB_HOST" faculty_flow_db
```

---

## 9. Credential Rotation Procedures

1. **Database Password**:
   - Update password in MySQL server.
   - Update `DB_PASSWORD` in `/etc/facultyflow/server.env`.
   - Run `sudo systemctl restart facultyflow`.
2. **JWT Secret**:
   - Rotate `JWT_SECRET` in environment configuration.
   - Restart service. Active users will be re-authenticated upon next token refresh.
3. **SMTP Credentials**:
   - Update `SMTP_USER` and `SMTP_PASS` in environment configuration.
   - Restart service. Pending emails in queue will deliver using the new credentials.

---

## 10. Production Readiness Checklist

| Requirement | Category | Verification Status | Operational Notes |
| :--- | :--- | :---: | :--- |
| **Strict Production Env Validation** | Configuration | **Verified in Development** | Fails fast if default secrets are used in `production` mode |
| **No Development Seed Creds in Prod** | Security | **Verified in Development** | `seedDatabase()` throws error when `NODE_ENV=production` |
| **Sanitized Error Responses** | Security | **Verified in Development** | Stack traces & internal details omitted when `NODE_ENV=production` |
| **Security Headers & Rate Limiting** | Security | **Verified in Development** | Tested: `X-Frame-Options: DENY`, nosniff, pwchange rate limits |
| **Role & Department Isolation** | Authorization | **Verified in Development** | Comprehensive positive and negative API tests pass |
| **Database Migrations 001–008** | Database | **Verified in Development** | Clean DB test passes; runner is idempotent |
| **Transactional Email Queue** | Architecture | **Verified in Development** | Atomic rollback verified; per-event versioned keys |
| **Worker Lease Renewal & Timeout** | Infrastructure | **Verified in Development** | Guarded status updates & 15s/20s SMTP timeouts verified |
| **Persistent PDF Storage Path** | Storage | **Requires Operator Configuration** | Must mount persistent volume to `EVENT_UPLOAD_DIR` in cloud |
| **Production Domain & TLS Setup** | Infrastructure | **Requires Operator Configuration** | Operator must provision SSL/TLS certificates and DNS records |
| **SMTP Mail Relay Provisioning** | Email | **Requires Operator Configuration** | Operator must provide valid SMTP credentials and verify DNS SPF/DKIM |
| **Production Database Setup** | Database | **Requires Operator Configuration** | Operator must provision MySQL 8.0 instance and run `npm run db:migrate` |
| **Final Manual Acceptance Test** | QA | **Requires External Integration Testing** | Perform smoke tests post-provisioning prior to user traffic cutover |

---

## 11. Mandatory Deployment Target: Vercel + Railway Architecture Guide

This section specifies the production hosting architecture for **Faculty Flow 2.0**:
- **Frontend**: Vercel (React + Vite + TypeScript Single-Page Application).
- **Backend API**: Railway (Node.js + Express + TypeScript on persistent container).
- **Database**: Railway MySQL (Private internal networking).
- **Email Worker**: Long-running Railway process (embedded in API instance or dedicated worker service).
- **Private PDF Storage**: Railway Persistent Volume mounted at `/app/uploads`.

```
                        +----------------------------------+
                        |      Vercel Edge Network         |
                        |      (React 18 + Vite SPA)       |
                        |  https://faculty-flow.vercel.app |
                        +----------------+-----------------+
                                         |
                                         | HTTPS (VITE_API_URL / CORS)
                                         v
                        +----------------------------------+
                        |      Railway App Container       |
                        |     (Express API + Worker)       |
                        | https://<railway>.up.railway.app |
                        +--------+----------------+--------+
                                 |                |
             Private WireGuard   |                |  Volume Mount
             mysql.railway.internal               |  /app/uploads
                                 v                v
                        +----------------+  +--------------+
                        | Railway MySQL  |  | Railway      |
                        | 8.0 Database   |  | Persistent   |
                        | (Private Net)  |  | Volume       |
                        +----------------+  +--------------+
```

---

### A. Vercel Frontend Configuration

#### 1. Repository Setup & Project Settings
When importing the `faculty-flow` repository into Vercel:

| Setting | Value | Notes |
| :--- | :--- | :--- |
| **Framework Preset** | `Vite` | Auto-detects Vite configuration |
| **Root Directory** | `client` | Standard recommendation for monorepos |
| **Build Command** | `npm run build` | Runs `tsc && vite build` inside `client/` |
| **Output Directory** | `dist` | Generated static bundle |
| **Install Command** | `npm install` | Installs client dependencies |

> **Alternative (Monorepo Root):** If Root Directory is left as `.`, Vercel uses the committed root `vercel.json` with Build Command `npm run build --workspace=client` and Output Directory `client/dist`.

#### 2. SPA Client-Side Routing Fallback
Both `client/vercel.json` and root `vercel.json` are committed to the repository, configuring SPA routing:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```
This ensures direct navigation and browser refreshes on routes like `/calendar`, `/tasks`, `/leaves`, and `/handovers` load the SPA index instead of returning HTTP 404.

#### 3. Frontend Environment Variables
Configure the following in **Vercel Project Settings > Environment Variables**:

| Variable | Environment | Example Value | Description |
| :--- | :--- | :--- | :--- |
| `VITE_API_URL` | Production, Preview | `https://faculty-flow-production.up.railway.app` | **Public build-time value.** Base URL for the Railway backend API. |

> [!IMPORTANT]
> `VITE_API_URL` is baked into client assets at build time. Never place secrets or private keys in any `VITE_*` variable.

---

### B. Railway Backend API & Database Configuration

#### 1. Railway MySQL Database Provisioning
1. In your Railway project, click **New > Database > Add MySQL**.
2. Railway creates a private MySQL 8.0 instance and automatically sets the following service variables:
   - `MYSQLHOST`: `mysql.railway.internal` (Private network DNS)
   - `MYSQLPORT`: `3306`
   - `MYSQLUSER`: `root`
   - `MYSQLPASSWORD`: *Secure random password*
   - `MYSQLDATABASE`: `railway`
   - `MYSQL_URL`: `mysql://root:...@mysql.railway.internal:3306/railway`
3. **Keep MySQL Private**: Do **NOT** generate a public domain for MySQL unless external administrative access is required. The backend connects directly over Railway's private WireGuard network via `mysql.railway.internal`.

#### 2. Railway API Service Setup
1. In the same Railway project, click **New > GitHub Repo > select faculty-flow**.
2. Railway detects the root `railway.json` committed to the repository:
   ```json
   {
     "$schema": "https://railway.app/railway.schema.json",
     "build": {
       "builder": "NIXPACKS",
       "buildCommand": "npm run build --workspace=server"
     },
     "deploy": {
       "startCommand": "npm run start --workspace=server",
       "healthcheckPath": "/api/health",
       "healthcheckTimeout": 100,
       "restartPolicyType": "ON_FAILURE",
       "restartPolicyMaxRetries": 10
     }
   }
   ```
3. Railway automatically injects `PORT`. Express listens dynamically on `process.env.PORT`.
4. Railway monitors `/api/health` before routing live web traffic to the container.

#### 3. Railway Persistent Private PDF Storage
1. In the Railway API service dashboard, navigate to **Settings > Volumes > Add Volume**.
2. Set Mount Path: `/app/uploads`.
3. Add environment variable to the API service:
   ```env
   EVENT_UPLOAD_DIR=/app/uploads
   ```
4. **Verification**: PDF uploads are saved to this persistent volume. Files survive application redeployments, restarts, and container rebuilds.

> [!CAUTION]
> **Production Gate**: Do NOT launch production without a Persistent Volume mounted to `EVENT_UPLOAD_DIR`. Local container files are ephemeral and will be destroyed upon every redeployment.

#### 4. Background Email Worker Options on Railway
Railway services are long-running persistent containers (not serverless functions). You have two operational options:

- **Option 1: In-Process Worker (Default & Recommended for single instances)**
  - Keep `RUN_NOTIFICATION_WORKER=true` (default).
  - The worker starts automatically with Express, gracefully shuts down on `SIGTERM`, and uses MySQL atomic row leasing (`locked_by`, `locked_at`) to safely process the queue.
  - Zero additional cost; no duplicate service needed.

- **Option 2: Dedicated Worker Service (For horizontally scaled web tiers)**
  - If you scale the API service to multiple replicas:
    1. Set `RUN_NOTIFICATION_WORKER=false` on the web API service.
    2. Add a second service from the same repo in Railway.
    3. Set Start Command: `npm run worker --workspace=server`.
    4. Connect the same database environment variables.
    5. This guarantees that exactly one dedicated worker process consumes email notifications.

#### 5. Railway Backend Environment Variables Reference
Configure the following in **Railway API Service > Variables**:

```env
# Runtime
NODE_ENV=production

# CORS & Domain Configuration
CLIENT_URL=https://faculty-flow.vercel.app
ALLOWED_ORIGINS=https://faculty-flow.vercel.app
ALLOW_VERCEL_PREVIEWS=false

# Cross-Site Cookie Authentication
COOKIE_SAME_SITE=none
COOKIE_SECRET=generate_at_least_32_characters_random_hex_string

# Database (Automatically mapped from Railway MySQL)
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
DB_CONNECTION_LIMIT=15

# Security Secrets (Generate using crypto.randomBytes(32).toString('hex'))
JWT_SECRET=generate_at_least_32_characters_random_hex_string
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Private Storage
EVENT_UPLOAD_DIR=/app/uploads

# Worker
RUN_NOTIFICATION_WORKER=true

# Email Notifications (Disabled until verified SMTP credentials provided)
EMAIL_ENABLED=false
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Faculty Flow <notifications@yourinstitution.edu>"
```

---

### C. Step-by-Step Deployment Order of Operations

To avoid configuration race conditions, execute the deployment in this exact order:

```
[1. Provision Railway MySQL]
            |
            v
[2. Run Migrations 001-008 via Railway CLI]
            |
            v
[3. Attach Persistent Volume to Railway Service (/app/uploads)]
            |
            v
[4. Deploy Railway Backend API & Verify /api/health]
            |
            v
[5. Deploy Vercel Frontend (VITE_API_URL = Railway URL)]
            |
            v
[6. Update Railway CLIENT_URL with Vercel Domain]
            |
            v
[7. Perform End-to-End Acceptance Smoke Test]
```

#### Step 1: Provision Railway MySQL
1. Add MySQL service in Railway.
2. Confirm the private network host `mysql.railway.internal` is ready.

#### Step 2: Run Database Migrations in Controlled Fashion
Never run migrations automatically on container boot in multi-replica production.
1. Install Railway CLI locally: `npm i -g @railway/cli`.
2. Link project: `railway link`.
3. Execute migrations from local terminal against the Railway database:
   ```bash
   railway run npm run db:migrate --workspace=server
   ```
4. Verify migration output: Migrations `001` through `008` applied cleanly.
5. Confirm no migrations are pending.

#### Step 3: Attach Persistent Storage Volume
1. In Railway API service settings, add a Volume mounted at `/app/uploads`.
2. Set `EVENT_UPLOAD_DIR=/app/uploads`.

#### Step 4: Deploy Railway Backend API Service
1. Set all required environment variables in Railway.
2. Trigger deployment.
3. Observe build logs: `npm run build --workspace=server` finishes with exit code 0.
4. Verify health check:
   ```bash
   curl -s https://<your-railway-app>.up.railway.app/api/health
   ```
   Must return HTTP 200 with `"status": "ok"` and `"database": {"status": "connected"}`.

#### Step 5: Deploy Frontend to Vercel
1. Import repository in Vercel with Root Directory `client`.
2. Set environment variable `VITE_API_URL=https://<your-railway-app>.up.railway.app`.
3. Deploy to production.
4. Note your assigned Vercel URL (e.g., `https://faculty-flow.vercel.app`).

#### Step 6: Configure CORS in Railway Backend
1. Go back to Railway API Service > Variables.
2. Update `CLIENT_URL` with your exact Vercel production URL:
   ```env
   CLIENT_URL=https://faculty-flow.vercel.app
   ```
3. If using PR preview deployments, set `ALLOW_VERCEL_PREVIEWS=true`.
4. Railway will automatically redeploy the service with updated CORS rules.

#### Step 7: Acceptance Smoke Test
1. Open the Vercel frontend in your browser.
2. Verify the System Health card shows API connected and Database connected.
3. Perform test login, create an academic event, upload a sample PDF, download the PDF, request leave, and confirm logout.

---

### D. Operational Readiness & Gated Blockers Summary

| Subsystem | Target Platform | Current Status | Required Action Prior to Go-Live |
| :--- | :--- | :---: | :--- |
| **Frontend Codebase** | Vercel | **Ready** | Connect repo, set Root Directory: `client`, configure `VITE_API_URL` |
| **Backend Codebase** | Railway | **Ready** | Connect repo, verify `railway.json`, configure environment secrets |
| **Database Migrations**| Railway MySQL | **Ready** | Run `railway run npm run db:migrate --workspace=server` |
| **CORS & Auth Cookies** | Vercel + Railway | **Ready** | Set `COOKIE_SAME_SITE=none` on Railway for cross-domain credentials |
| **PDF Document Storage**| Railway Volume | **GATED BLOCKER** | **Must attach persistent volume to `/app/uploads` before uploading live files** |
| **Email Delivery** | SMTP Relay | **GATED BLOCKER** | **Keep `EMAIL_ENABLED=false` until authorized SMTP credentials are provided** |
| **Database Backups** | Railway MySQL | **Requires Operator** | Enable automated daily database backups in Railway dashboard |

