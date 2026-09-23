# Royal Packaging CRM
# Client Dry-Run Deployment Runbook

**Document Version:** 1.0.0  
**Effective Date:** September 23, 2026  
**Audience:** DevOps Engineers, Platform Administrators, Deployment Engineers  
**Target Baseline:** Step 9.2 Hardened Architecture (Orders Live Integration)

---

## 1. Architecture & Deployment Model

The Royal Packaging CRM system consists of three deployment tiers:

```
┌─────────────────────────────────────────────────────────────┐
│                   Reverse Proxy (Nginx)                     │
│               https://crm.royalpackaging.com                │
└──────────────┬───────────────────────────────┬──────────────┘
               │ /api                          │ / (Static SPA)
               ▼                               ▼
┌─────────────────────────────┐  ┌────────────────────────────┐
│      Node.js Backend        │  │     Static Frontend        │
│   (Native HTTP Server)      │  │     (dist/frontend)        │
│      Port 3000 (bind 0.0.0.0)│  │   HTML5 History PushState │
└──────────────┬──────────────┘  └────────────────────────────┘
               │ Pool (pg)
               ▼
┌─────────────────────────────┐
│      PostgreSQL 15+         │
│   (Database: royal_packaging)│
└─────────────────────────────┘
```

### Key Principles
1. **Single-Origin Deployment (Strongly Recommended):**  
   Hosting the frontend and backend under the same origin (e.g., `https://crm.company.com` and `https://crm.company.com/api`) ensures zero cross-origin cookie issues (`SameSite=Lax` default works seamlessly) and eliminates CORS preflight overhead.
2. **Authoritative Backend Authentication:**  
   Zero client-side secrets or tokens. Authentication is backed by HTTP-only `rp_session` cookies encrypted and signed using `SESSION_SECRET`.
3. **Strict Build-Time Production Checks:**  
   The frontend build pipeline strictly prohibits `VITE_DATA_MODE=mock` and prohibits `VITE_API_URL` pointing to `localhost` in production (`import.meta.env.PROD === true`).

---

## 2. Infrastructure Prerequisites

| Component | Minimum Version | Recommended Specification |
|:---|:---:|:---|
| **Operating System** | Linux (Ubuntu 22.04 LTS / Debian 12 / Alpine) or Windows Server | 2 vCPU, 4GB RAM minimum |
| **Node.js** | `>= 20.0.0` | Node.js 20.x or 22.x LTS with npm 10+ |
| **PostgreSQL** | `>= 15.0` | PostgreSQL 16+ with SSL enabled, 20 max connections |
| **Reverse Proxy / Web Server** | Nginx 1.22+ or Caddy 2.7+ | SSL/TLS termination with modern ciphers |

---

## 3. Step-by-Step Staging & Production Rollout

### Step 3.1: Environment Variable Provisioning

Create and populate the production environment variables securely (e.g., via AWS SSM, HashiCorp Vault, Kubernetes Secrets, or server-level `.env` files with `chmod 600`).

#### Backend Environment (`backend/.env` or container env)
```bash
NODE_ENV=production
SERVER_HOST=0.0.0.0
SERVER_PORT=3000

# PostgreSQL connection string
DATABASE_URL="postgresql://crm_app_user:REPLACE_WITH_SECURE_PASSWORD@db-host:5432/royal_packaging_crm?sslmode=require"

# 64-character high-entropy random hex secret
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET="REPLACE_WITH_GENERATED_64_CHAR_HEX_SECRET"

# Primary frontend origin
FRONTEND_ORIGIN="https://crm.royalpackaging.com"

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

#### Frontend Environment (`frontend/.env` or build pipeline env)
```bash
# MUST be 'api' in production
VITE_DATA_MODE=api

# Production API endpoint (relative /api when reverse-proxied)
VITE_API_URL=/api
```

---

### Step 3.2: Database Migration & Administrative Bootstrap

Run database migrations and initial seed **before starting the application server**:

```bash
# 1. Install dependencies
npm ci
npm ci --prefix backend

# 2. Run schema migrations (applies migrations 001-014 sequentially)
npm run db:migrate

# 3. Seed initial administrative role and default user
# You can customize initial credentials via environment variables:
INITIAL_ADMIN_EMAIL="admin@royalpackaging.com" \
INITIAL_ADMIN_PASSWORD="REPLACE_WITH_SECURE_INITIAL_PASSWORD" \
npm run db:seed
```

> [!NOTE]
> The `db:seed` script is completely **idempotent**. If the administrator or roles already exist, it safely exits without modifying existing records or altering passwords.

---

### Step 3.3: Backend Build & Process Management

Compile TypeScript and launch the backend daemon using a process manager such as `systemd` or `pm2`:

```bash
# Build backend TypeScript
npm run build --prefix backend

# Run with PM2
pm2 start backend/apps/api/dist/server.js --name "royal-crm-api" --env production
# Or run with tsx if running TypeScript directly
# pm2 start "npx tsx apps/api/src/server.ts" --name "royal-crm-api" --cwd backend
```

---

### Step 3.4: Frontend Build & Asset Deployment

Build the static production bundle:

```bash
# Build frontend with production environment variables active
npm run build
```

The compiled assets are generated in `dist/frontend/`. Deploy this directory to your web server web root (e.g., `/var/www/royal-crm/frontend`).

---

## 4. Nginx Reverse Proxy & SSL Configuration

Save the following configuration to `/etc/nginx/sites-available/royal-crm.conf`:

```nginx
# Upstream Node.js API
upstream crm_backend {
    server 127.0.0.1:3000 max_fails=3 fail_timeout=10s;
    keepalive 32;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name crm.royalpackaging.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name crm.royalpackaging.com;

    # SSL Certificates
    ssl_certificate /etc/letsencrypt/live/crm.royalpackaging.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crm.royalpackaging.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Global Security Headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Static Frontend SPA
    root /var/www/royal-crm/frontend;
    index index.html;

    # Frontend Route Rewrites (Single Page Application fallback)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Gateway Proxy
    location /api/ {
        proxy_pass http://crm_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Support cookie forwarding
        proxy_cookie_path / /;
        proxy_pass_header Set-Cookie;

        # Timeout settings
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }

    # Health check passthrough
    location /health {
        proxy_pass http://crm_backend/health;
        proxy_set_header Host $host;
    }
}
```

---

## 5. Security & Credential Rotation Protocol

Prior to the client dry run, complete the mandatory credential rotation:

1. **Rotate PostgreSQL Password:**  
   Update the PostgreSQL role password on the database server, and update `DATABASE_URL` in the deployment secrets.
2. **Rotate `SESSION_SECRET`:**  
   Generate a new cryptographically secure 64-character secret. Note: rotating `SESSION_SECRET` invalidates existing browser sessions, requiring all users to re-authenticate.
3. **Change Initial Admin Password:**  
   Log in with the seeded credentials (`admin@royalpackaging.com`) and update the administrative password to a customer-approved passphrase.
4. **Git Security Audit:**  
   Verify that `.env`, `backend/.env`, and `frontend/.env` remain untracked by Git (`git status --ignored`).

---

## 6. Smoke Testing & Verification Checklist

Execute this checklist immediately post-deployment:

| Step | Action | Expected Result | Verified? |
|:---:|:---|:---|:---:|
| 1 | `curl -f https://crm.royalpackaging.com/health` | Returns `200 OK` with `{ success: true, data: { status: "healthy" } }` | [ ] |
| 2 | `curl -f https://crm.royalpackaging.com/health/ready` | Returns `200 OK` with database status `ready: true` | [ ] |
| 3 | Open `https://crm.royalpackaging.com` in browser | Loads login page with "Operations Console" copy (no prototype/mock notices) | [ ] |
| 4 | Attempt sign-in with invalid credentials | Shows red alert "Invalid email or password", 401 response | [ ] |
| 5 | Sign in with valid Admin credentials | Successfully authenticates, receives `rp_session` cookie, redirects to Overview | [ ] |
| 6 | Hard refresh browser (Ctrl+F5) | Session persists via `GET /api/auth/session` without prompting for re-login | [ ] |
| 7 | Navigate to `/clients` | Table loads live client accounts from PostgreSQL with sorting and search | [ ] |
| 8 | Create new client via `New Client` | Client persists to PostgreSQL; unique account code verified | [ ] |
| 9 | Navigate to `/orders` | Table loads live order commitments with status/priority filtering | [ ] |
| 10 | Create new order via `New Order` | Searchable client dropdown loads clients; order created with line items | [ ] |
| 11 | Order Status Transition | Progress order from Draft $\rightarrow$ Confirmed $\rightarrow$ In production | [ ] |
| 12 | Sign out | Session revoked in database; `rp_session` cookie cleared; redirects to `/login` | [ ] |

---

## 7. Rollback Procedure

If a critical failure occurs during deployment:

1. **Roll Back Frontend:**  
   Restore the previous `dist/frontend` directory or swap the web server root symlink:
   ```bash
   ln -sfn /var/www/royal-crm/releases/previous /var/www/royal-crm/frontend
   systemctl reload nginx
   ```
2. **Roll Back Backend:**  
   Revert the backend application binary and restart PM2/systemd:
   ```bash
   pm2 restart "royal-crm-api"
   ```
3. **Database Migration Rollback:**  
   If necessary, execute individual down migrations manually or restore from pre-deployment snapshot:
   ```bash
   pg_restore -h db-host -U crm_admin -d royal_packaging_crm pre_deploy_backup.dump
   ```

---

## 8. Clean Client Start & Browser Reset Procedure

### 8.1 Clean Client Start

Follow this exact sequence to ensure a clean, isolated client test session:

1. **Close Previous Tabs:** Close all existing CRM tabs or development windows.
2. **Open Incognito/Private Window:** Launch a fresh, clean private/incognito browser window.
3. **Navigate to Client URL:** Navigate directly to the configured production client URL (e.g., `https://crm.royalpackaging.com` or local deployment URL).
4. **Do Not Reuse Tabs:** Do not reuse stale browser tabs, dev session tabs, or bookmarks with cached parameters.
5. **Verify Deployment Version:** Confirm the application loads from the current deployment (clean "OPERATIONS CONSOLE" copy, zero mock preview banners).
6. **Verify Initial State:** Confirm the session starts strictly unauthenticated on `/login`.
7. **Sign In:** Enter the provisioned client administrator credentials (`admin@royalpackaging.com` and the provisioned high-entropy password) and click "Sign in".
8. **Verify Dashboard:** Confirm redirect to the Dashboard/Overview page with full administrative navigation.
9. **Verify Session Persistence:** Perform a full page refresh (F5 or reload). Confirm the session remains authenticated via `GET /api/auth/session`.
10. **Test Sign Out:** Click Sign out from the profile menu.
11. **Verify Revocation:** Confirm immediate redirection to `/login` and verify that the session cookie was cleared.
12. **Sign In Again:** Re-enter credentials to log back in.
13. **Begin Dry-Run Testing:** Proceed with end-to-end client portfolio and order management workflows.

### 8.2 Client Browser Hard-Reset Procedure (Troubleshooting Stale Assets)

If a client user encounters cached styles, stale JavaScript bundles, or old cookie state, perform this domain-isolated hard reset:

1. **Open Developer Tools / Site Settings:**
   - In Chrome/Edge: Click the padlock / tune icon next to the address bar, select **Site settings** (or press F12 $\rightarrow$ Application tab $\rightarrow$ Storage).
2. **Clear Site Data for CRM Domain Only:**
   - Click **Clear data** / **Clear site data** specifically for the CRM domain.
   - Clear cookies for the CRM domain.
   - Clear cached images and files for the CRM domain.
   - *(Do NOT clear global browser history or passwords for other sites).*
3. **Close CRM Tabs:** Close all open browser tabs pointing to the CRM application.
4. **Relaunch Browser:** Close and reopen the browser application.
5. **Revisit CRM URL:** Navigate to the CRM URL and verify clean asset loading.
