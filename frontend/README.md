# LeaveHQ

LeaveHQ is an administrator-only internal leave-management application. The
frontend uses React and Vite; the API uses FastAPI and connects to PostgreSQL.

## Local development

1. Create a Python virtual environment in `backend` and install the pinned
   dependencies:

   ```powershell
   cd backend
   py -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   Copy-Item .env.example .env
   ```

2. Set `DATABASE_URL` in `backend/.env` to the intended development PostgreSQL
   database and set a random `SESSION_SECRET` of at least 32 characters. For
   example, generate one with
   `.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(32))"`.
   Use a separate database for tests; never point tests at production. The
   application connection uses TLS.

3. Start the API from `backend`:

   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
   ```

4. In a separate terminal, install frontend dependencies and start Vite:

   ```powershell
   cd frontend
   npm ci
   Copy-Item .env.example .env
   npm run dev
   ```

   Vite proxies `/api` requests to `VITE_DEV_API_TARGET` (default
   `http://127.0.0.1:8000`) so browser requests are same-origin.

## Database setup and administrator access

- `backend/app/db/schema.sql` describes the original application schema;
  `backend/upgrade_leave_schema.py` adds the leave-duration fields. Neither
  script is run automatically by the application.
- Review the SQL against the target database, take a verified backup, and
  obtain approval before applying schema changes. Never reset, truncate, or
  recreate tables containing business records.
- `backend/bootstrap_admin.py --confirm-create-admin` interactively creates an
  administrator and hashes the supplied password. Run it only against the
  explicitly selected non-production database during local setup. Production
  account provisioning requires an approved operational procedure.
- Do not commit `.env` files. Keep `DATABASE_URL` and `SESSION_SECRET` in a
  secret manager or protected environment configuration. A production session
  secret must be unique and at least 32 characters.

## Tests and checks

From the repository root:

```powershell
backend\.venv\Scripts\python.exe -m compileall -q backend
Push-Location backend
.\.venv\Scripts\python.exe -m pytest tests
Pop-Location
cd frontend
npm run lint
npm run build
```

The backend tests use isolated fakes and do not write to PostgreSQL. They do
not replace integration tests against a dedicated test database.

## Backups and recovery

- Configure scheduled encrypted PostgreSQL backups using the database
  provider's supported backup/PITR facilities or `pg_dump` to protected storage.
  Keep retention aligned with company policy and restrict access to backup
  artifacts.
- Periodically restore a backup into a separate staging database and verify
  employee, leave, and audit-log integrity before relying on the backup plan.
- Recover by restoring to a new or explicitly selected recovery database,
  validating it, then changing the protected `DATABASE_URL` during an approved
  maintenance window. Do not test restoration against the live database.
- This repository does not automate backups, retention, or recovery.

## Deployment prerequisites

The included authentication is a starting point, not production approval.
Before office use:

- Put the frontend and API behind a same-origin HTTPS reverse proxy. Restrict
  ingress at the office firewall or VPN; CORS is not an access boundary.
- Set `APP_ENV=production`, a unique secret `SESSION_SECRET`, and explicit
  `DATABASE_URL` in the protected runtime environment. The secure session
  cookie is enabled outside development.
- Confirm administrator provisioning and recovery, proxy/firewall policy,
  session expiry, monitoring, and database backup/restore procedures with the
  responsible operator.
- The login failure limiter is process-local and is not shared across workers;
  enforce additional rate limiting at the trusted gateway before scaling to
  multiple workers.
- Sessions are signed and expire after eight hours, but are not stored
  server-side. Logging out clears the browser cookie; it cannot revoke a copied
  cookie before expiry. Add a reviewed revocation/session store before treating
  this as production-grade access control.
- Review and verify any migration separately before applying it. No deployment
  or production migration is automated here.

Build the static frontend with `npm run build`; serve the output from `dist`
through the same-origin proxy. Set `VITE_API_BASE_URL` only when the API is
intentionally mounted at a different same-origin path.
