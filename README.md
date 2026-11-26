# LeaveHQ

### Internal Administrator-Only Leave Management System

LeaveHQ is an internal leave management application developed for Abacus Digital to centralise employee leave records, manage team availability, identify overlapping absences, and generate structured leave reports.

Built with React, FastAPI, and PostgreSQL, LeaveHQ provides administrators with a unified workspace for managing employee information and leave operations.

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Technology Stack](#technology-stack)
4. [System Architecture](#system-architecture)
5. [Project Structure](#project-structure)
6. [Application Workflow](#application-workflow)
7. [Local Development Setup](#local-development-setup)
8. [Environment Configuration](#environment-configuration)
9. [API Architecture](#api-architecture)
10. [Production Deployment](#production-deployment)
11. [Security](#security)
12. [Testing and Quality Checks](#testing-and-quality-checks)
13. [Maintenance](#maintenance)
14. [Project Status](#project-status)

---

## 1. Overview

LeaveHQ is designed exclusively for internal administrative use.

The application enables authorised administrators to:

- Maintain employee records.
- Record and manage employee leave.
- Monitor daily and upcoming employee availability.
- View leave information through a monthly calendar.
- Identify overlapping employee absences.
- Generate employee-wise and date-range reports.
- Export leave information in CSV and PDF/print formats.

**Application Type:** Internal administrative application  
**Access Model:** Administrator-only  
**Architecture:** Separated frontend and backend  
**Database:** PostgreSQL  
**Hosting:** Vercel and Neon

---

## 2. Features

### 2.1 Overview Dashboard

- Employee availability overview.
- Employees currently away.
- Upcoming leave summary.
- Overlapping absence indicators.
- Centralised operational overview.

### 2.2 Employee Management

- Create employee records.
- Update employee information.
- Maintain employee codes and contact information.
- Manage departments and designations.
- Track active and inactive employment status.

### 2.3 Leave Management

- Create leave records for individual employees.
- Submit multiple scattered leave dates in one operation.
- Full-day leave.
- First-half and second-half leave.
- Custom-hour leave durations.
- Edit existing leave records.
- Cancel leave records without physically deleting historical records.
- Validate conflicting leave entries.

### 2.4 Leave Calendar

- Monthly calendar interface.
- Visual representation of employee absences.
- Leave duration indicators.
- Navigate between calendar periods.
- View leave details by date.

### 2.5 Reports and Exports

- Employee-wise leave reports.
- Date-range filtering.
- Leave record summaries.
- Overlapping absence reports.
- CSV export.
- Printable and PDF reports.

### 2.6 Authentication and Administration

- Administrator login.
- Password hashing.
- Signed session cookies.
- CSRF protection.
- Active administrator verification.
- Administrator account provisioning through a backend bootstrap script.

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React |
| Build Tool | Vite |
| Programming Language | JavaScript |
| Backend | Python |
| Backend Framework | FastAPI |
| Database | PostgreSQL |
| Database Hosting | Neon |
| Database Driver | PG8000 |
| Authentication | Signed Session Cookies |
| Password Hashing | pwdlib |
| Frontend Hosting | Vercel |
| Backend Hosting | Vercel |
| Version Control | Git |
| Source Code Hosting | GitHub |

---

## 4. System Architecture

LeaveHQ follows a separated frontend-backend architecture.

The frontend and backend are deployed as independent Vercel projects, while Neon PostgreSQL provides persistent data storage.

### Architecture Diagram

```text
                 ADMINISTRATOR
                       |
                       |
                       v
             REACT + VITE FRONTEND
                       |
                       |
                 /api/* REQUESTS
                       |
                       v
                VERCEL REWRITES
                       |
                       |
                       v
                FASTAPI BACKEND
                       |
             +---------+---------+
             |         |         |
             v         v         v
        AUTHENTICATION EMPLOYEES LEAVE LOGIC
                       |
                       |
                       v
                PG8000 DRIVER
                       |
                  SSL CONNECTION
                       |
                       v
               NEON POSTGRESQL
```

### Frontend

The React application is responsible for:

- User interface and navigation.
- Dashboard rendering.
- Employee management forms.
- Leave management forms.
- Calendar visualisation.
- Report generation and exports.
- API communication.
- Client-side interaction and feedback.

### Backend

The FastAPI application is responsible for:

- Administrator authentication.
- Session validation.
- CSRF verification.
- Employee management APIs.
- Leave management APIs.
- Business logic and validation.
- Conflict detection.
- Database transactions.
- Audit logging.

### Database

Neon PostgreSQL stores persistent application information, including:

- Administrator accounts.
- Employee records.
- Department information.
- Leave types.
- Leave records.
- Audit information.

The database operates independently of the Vercel application deployments.

---

## 5. Project Structure

```text
LeaveHQ/
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes/
│   │   │       ├── auth.py
│   │   │       ├── employees.py
│   │   │       └── leaves.py
│   │   │
│   │   ├── core/
│   │   │   └── security.py
│   │   │
│   │   ├── db/
│   │   │   └── connection.py
│   │   │
│   │   ├── schemas/
│   │   │
│   │   ├── services/
│   │   │
│   │   └── main.py
│   │
│   ├── main.py
│   ├── requirements.txt
│   ├── bootstrap_admin.py
│   ├── .env.example
│   └── .gitignore
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── api.js
│   │
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── vercel.json
│   ├── .env.example
│   └── .gitignore
│
├── docs/
│
├── backups/
│
├── .gitignore
└── README.md
```

---

## 6. Application Workflow

### Administrator Authentication

1. Administrator opens the LeaveHQ application.
2. Administrator submits login credentials.
3. Frontend sends the authentication request to FastAPI.
4. Backend verifies the administrator against PostgreSQL.
5. Backend creates a signed session.
6. An HTTP-only session cookie is issued.
7. The frontend receives the CSRF token.
8. Authenticated requests include the session cookie and appropriate CSRF header.

### Employee Creation

1. Administrator opens Employee Management.
2. Administrator enters employee information.
3. Frontend submits the employee data.
4. Backend validates the submitted information.
5. Backend checks relevant constraints.
6. Employee information is saved to PostgreSQL.
7. The frontend refreshes the employee list.

### Leave Creation

1. Administrator selects an employee.
2. Administrator selects the leave type.
3. Administrator enters one or more leave dates.
4. Administrator specifies the duration for each date.
5. Frontend submits the batch leave request.
6. Backend validates the administrator session.
7. Backend validates employee and leave information.
8. Conflict checks are performed.
9. Valid leave records are committed transactionally.
10. Audit information is recorded.
11. The updated information is returned to the frontend.

---

## 7. Local Development Setup

### Prerequisites

Install the following:

- Python 3.12 or compatible version.
- Node.js and npm.
- Git.
- Access to a Neon PostgreSQL database.

### 7.1 Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/LeaveHQ.git

cd LeaveHQ
```

Replace `YOUR_USERNAME` with the appropriate GitHub username.

### 7.2 Configure the Backend

Navigate to the backend directory:

```powershell
cd backend
```

Create a virtual environment:

```powershell
python -m venv .venv
```

Activate it:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
pip install -r requirements.txt
```

Create the local environment file:

```powershell
Copy-Item .env.example .env
```

Configure the required environment variables in `backend/.env`.

### 7.3 Configure the Database

The backend uses Neon PostgreSQL through PG8000.

The database connection is configured through `DATABASE_URL`.

The application expects an SSL-enabled PostgreSQL connection.

Use the connection string provided by Neon.

### 7.4 Create an Administrator

Run:

```powershell
python bootstrap_admin.py --confirm-create-admin
```

The script interactively requests:

- Administrator username.
- Administrator password.
- Password confirmation.

Passwords must meet the minimum length requirement enforced by the bootstrap script.

Administrator passwords are stored as hashes, not plaintext.

### 7.5 Start the Backend

From the backend directory:

```powershell
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Backend base URL:

```text
http://127.0.0.1:8000
```

Health endpoint:

```text
http://127.0.0.1:8000/api/health
```

### 7.6 Configure the Frontend

Open a second terminal:

```powershell
cd frontend
```

Install frontend dependencies:

```powershell
npm install
```

Create the local environment file:

```powershell
Copy-Item .env.example .env.local
```

Configure:

```env
VITE_API_BASE_URL=/api
VITE_DEV_API_TARGET=http://127.0.0.1:8000
```

The Vite development server uses the proxy configured in `vite.config.js` to forward API requests to the local FastAPI backend.

### 7.7 Start the Frontend

```powershell
npm run dev
```

Frontend URL:

```text
http://localhost:5173
```

The frontend and backend must both be running during local development.

---

## 8. Environment Configuration

Environment variables are used to separate application configuration from source code.

### Backend Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `SESSION_SECRET` | Secret used to sign administrator sessions |
| `APP_ENV` | Application environment |
| `CORS_ORIGINS` | Explicit browser origins when cross-origin access is required |

Example:

```env
DATABASE_URL=your_neon_connection_string
SESSION_SECRET=your_random_secret_of_at_least_32_characters
APP_ENV=development
```

### Frontend Environment Variables

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | API base path; defaults to `/api` |
| `VITE_DEV_API_TARGET` | Local backend URL used by the Vite development proxy |

Example:

```env
VITE_API_BASE_URL=/api
VITE_DEV_API_TARGET=http://127.0.0.1:8000
```

**Security requirements:**

- Never commit `.env` files.
- Never expose database credentials.
- Never expose production session secrets.
- Never place backend secrets in frontend environment variables.
- Configure production environment variables directly through Vercel.

---

## 9. API Architecture

The backend exposes REST API endpoints through FastAPI.

All application API routes use the `/api` prefix.

### Authentication

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Administrator login |
| GET | `/api/auth/me` | Retrieve current administrator session |
| POST | `/api/auth/logout` | End administrator session |

### Employees

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/employees/` | Retrieve employees |
| POST | `/api/employees/` | Create employee |
| PUT | `/api/employees/{employee_id}` | Update employee |

### Leaves

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/leaves/` | Retrieve leave records |
| POST | `/api/leaves/` | Create a leave record |
| POST | `/api/leaves/batch` | Create multiple leave records |
| PUT | `/api/leaves/{leave_id}` | Update leave record |
| PATCH | `/api/leaves/{leave_id}/cancel` | Cancel leave |
| DELETE | `/api/leaves/{leave_id}` | Cancel leave through the deletion endpoint |
| GET | `/api/leaves/types` | Retrieve active leave types |
| GET | `/api/leaves/collisions` | Retrieve overlapping absences |

### Health Check

```text
GET /api/health
```

The health endpoint checks database connectivity.

Expected response:

```json
{
  "status": "healthy",
  "database": "connected",
  "app": "LeaveHQ"
}
```

---

## 10. Production Deployment

LeaveHQ is hosted using two separate Vercel projects and one Neon PostgreSQL database.

### 10.1 Frontend Deployment

**Vercel Project:** `leavehq`

**Root Directory:**

```text
frontend
```

**Framework:** Vite

**Build Command:**

```bash
npm run build
```

**Output Directory:**

```text
dist
```

Production URL:

https://leavehq-seven.vercel.app

### 10.2 Backend Deployment

**Vercel Project:** `leavehq-api`

**Root Directory:**

```text
backend
```

**Framework:** FastAPI

**Entry Point:**

```text
main.py
```

The root `main.py` exposes the FastAPI application instance.

Production URL:

https://leavehq-api.vercel.app

### 10.3 API Routing Through Vercel

The frontend uses:

```text
frontend/vercel.json
```

This file defines rewrites that forward frontend API requests to the backend deployment.

The current configuration includes explicit rewrites for employee and leave collection routes to preserve their canonical trailing-slash backend paths.

This keeps the browser-facing requests on the frontend origin and avoids relying on browser redirects between separate Vercel domains for those routes.

### 10.4 Production Environment Variables

Configure backend environment variables through:

**Vercel → leavehq-api → Settings → Environment Variables**

Required variables:

- `DATABASE_URL`
- `SESSION_SECRET`
- `APP_ENV=production`

Use the appropriate environment scope for production and preview deployments.

The frontend uses `/api` as its default API base path.

### 10.5 Deploying Through Vercel CLI

Frontend:

```powershell
cd frontend

npm run lint

npm run build

vercel --prod
```

Backend:

```powershell
cd backend

vercel --prod
```

Vercel can also be connected to GitHub for automatic deployments when commits are pushed to the configured branch.

---

## 11. Security

LeaveHQ implements several application-level security measures.

### Authentication

- Administrator-only access.
- Password hashing using pwdlib.
- Signed session cookies.
- Session expiration.
- Active administrator verification.

### Session Security

- HTTP-only session cookies.
- Secure cookies in production.
- SameSite cookie policy.
- Eight-hour session lifetime.
- CSRF token validation for state-changing operations.

### Database Security

- Neon PostgreSQL.
- SSL-enabled database connections.
- Credentials supplied through environment variables.
- Transactional database operations.

### Application Security

- Server-side validation.
- Employee and leave conflict checks.
- Audit logging.
- Login attempt limiting.

### Production Hardening

The following should be maintained as part of production operations:

- Restrict access to authorised administrators.
- Use strong, unique administrator passwords.
- Enable multi-factor authentication for hosting and source-control accounts.
- Rotate exposed credentials.
- Maintain database backups.
- Review deployment and application logs.
- Use shared rate limiting for serverless deployments where required.
- Regularly review administrator access.

The Vercel application URL is publicly reachable unless additional access restrictions are configured. Application authentication should not be treated as a replacement for infrastructure-level access controls.

---

## 12. Testing and Quality Checks

### Frontend Linting

```powershell
cd frontend

npm run lint
```

### Frontend Production Build

```powershell
npm run build
```

### Backend Tests

```powershell
cd backend

pytest
```

### Production Health Check

```powershell
Invoke-RestMethod https://leavehq-api.vercel.app/api/health
```

### Production API Routing Check

```powershell
$urls = @(
    "https://leavehq-seven.vercel.app/api/health",
    "https://leavehq-seven.vercel.app/api/employees",
    "https://leavehq-seven.vercel.app/api/leaves"
)

foreach ($url in $urls) {
    $response = Invoke-WebRequest $url -SkipHttpErrorCheck

    Write-Host "`n$url"
    Write-Host "Status: $($response.StatusCode)"
    Write-Host "Body: $($response.Content)"
}
```

Unauthenticated employee and leave requests should return `401 Unauthorized`, confirming that the protected API endpoints are reachable.

---

## 13. Maintenance

### Git Workflow

Recommended development workflow:

```text
Local Development
       |
       v
Run Lint and Build
       |
       v
Review Changes
       |
       v
Git Commit
       |
       v
Push to GitHub
       |
       v
Vercel Deployment
       |
       v
Production Verification
```

### Useful Git Commands

Check current changes:

```bash
git status
```

Review recent commits:

```bash
git log --oneline -10
```

Stage changes:

```bash
git add .
```

Commit changes:

```bash
git commit -m "Describe your changes"
```

Push changes:

```bash
git push
```

### Backup Recommendations

- Maintain regular Neon database backups.
- Verify backup restoration procedures.
- Preserve important project documentation.
- Never store production secrets in Git.
- Test significant database changes before production deployment.

---

## 14. Project Status

| Component | Status |
|---|---|
| React frontend | Deployed |
| FastAPI backend | Deployed |
| Neon PostgreSQL | Connected |
| Administrator authentication | Implemented |
| Employee management | Implemented |
| Leave management | Implemented |
| Leave calendar | Implemented |
| Collision detection | Implemented |
| Reports and exports | Implemented |
| Vercel API rewrites | Configured |
| GitHub repository | To be connected |

### Production Applications

**Frontend**

https://leavehq-seven.vercel.app

**Backend**

https://leavehq-api.vercel.app

**Backend Health Check**

https://leavehq-api.vercel.app/api/health

---

## Maintainer

Developed and maintained for internal administrative operations at **Abacus Digital**.

**LeaveHQ**  
*Centralised Leave Management. Clearer Team Availability.*
