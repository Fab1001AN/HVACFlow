# HVACFlow — Setup & Implementation Guide

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 22 LTS | `node --version` |
| npm | 10+ | `npm --version` |
| Docker Desktop | Latest | `docker --version` |
| Git | Any | `git --version` |

---

## Step 1 — Extract & Prepare

```bash
# Extract the archive
tar -xzf hvacflow.tar.gz
cd hvacflow

# Copy environment files
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local
```

Edit `.env` and set strong values for:
- `POSTGRES_PASSWORD` — any strong password
- `JWT_ACCESS_SECRET` — minimum 64 random characters
- `JWT_REFRESH_SECRET` — minimum 64 random characters (different from access)

Generate strong secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Also update `apps/api/.env` with the same DATABASE_URL password and JWT secrets.

---

## Step 2 — Start PostgreSQL

```bash
docker-compose up -d postgres
# Wait ~5 seconds then verify:
docker-compose ps
# Should show: hvacflow_postgres ... running
```

---

## Step 3 — Install Dependencies

```bash
npm install
```

Turborepo installs dependencies for all workspaces in one command.

---

## Step 4 — Generate Prisma Client & Run Migrations

```bash
# Generate the Prisma TypeScript client
npm run db:generate

# Apply all migrations to the database
npm run db:migrate
```

---

## Step 5 — Seed the Database

```bash
npm run db:seed
```

This creates:
- 28 permission codes
- 3 system roles (Admin, Supervisor, Operator)
- 4 priority levels (Low, Normal, High, Urgent)
- 7 departments (Fabrication, Foaming, Assembly, Electrical, Painting, QA, Logistics)
- 10 process definitions (Cutting, Bending, Punching, Foaming, Sub-Assembly, Assembly, Electrical Wiring, Painting, Testing, Dispatch)
- 4 unit types, 6 part types
- Unit compositions for RTU and AHU
- Process routes for all part types and unit types
- Checklist templates for Foaming, Assembly, Electrical, Testing
- Default admin user: `admin@hvacflow.com` / `Admin@HVACFlow1`

**Change the admin password immediately after first login.**

---

## Step 6 — Start Development Servers

```bash
npm run dev
```

This starts both servers concurrently via Turborepo:

| Service | URL |
|---|---|
| Frontend (Next.js) | http://localhost:3000 |
| Backend API (NestJS) | http://localhost:4000/api/v1 |
| Swagger Docs | http://localhost:4000/api/v1/docs |
| Prisma Studio | `npm run db:studio` → http://localhost:5555 |

---

## Step 7 — First Login & Configuration

1. Open http://localhost:3000
2. Login: `admin@hvacflow.com` / `Admin@HVACFlow1`
3. Go to **Configuration → Users** → Create your real admin user
4. Go to **Configuration → Users** → Disable or change the seed admin
5. Verify Mission Control shows the Kanban board with seeded departments

---

## Project Structure Reference

```
hvacflow/
├── apps/
│   ├── api/                    # NestJS backend (port 4000)
│   │   └── src/
│   │       ├── modules/        # Domain modules
│   │       │   ├── auth/       # JWT + Passport
│   │       │   ├── production-tasks/  # The workflow engine
│   │       │   ├── workflow-progress/ # Progress calculator
│   │       │   ├── mission-control/   # Kanban aggregation
│   │       │   ├── realtime/          # WebSocket gateway
│   │       │   └── ... (20 more modules)
│   │       ├── common/         # Guards, decorators, Prisma service
│   │       └── config/         # Env validation (fails fast at boot)
│   │
│   └── web/                    # Next.js frontend (port 3000)
│       └── src/
│           ├── app/            # App Router pages (Next.js 15)
│           ├── features/       # Feature components (Task Drawer, Kanban Card)
│           ├── components/     # Shared UI primitives
│           ├── lib/            # API client, WebSocket, utils
│           └── store/          # Zustand auth store
│
├── packages/
│   ├── shared-types/           # Enums + interfaces shared between API and web
│   └── config/                 # Shared ESLint, Prettier configs
│
└── prisma/
    ├── schema.prisma           # 22-table database schema
    └── seed.ts                 # All configurable defaults
```

---

## Key Commands

```bash
# Development
npm run dev              # Start all apps with hot reload
npm run build            # Build all apps for production
npm run typecheck        # TypeScript check across all packages
npm run lint             # ESLint across all packages

# Database
npm run db:generate      # Regenerate Prisma client after schema changes
npm run db:migrate       # Apply pending migrations (dev)
npm run db:migrate:deploy # Apply migrations (production)
npm run db:seed          # Seed configurable defaults
npm run db:studio        # Open Prisma Studio (database browser)
npm run db:reset         # Reset DB and re-seed (dev only — destructive)
```

---

## Adding a New Manufacturing Process (No Code Required)

1. **Configuration → Departments** → Create department if needed
2. **Configuration → Processes** → Create process definition
   - Set Department, Applies To (Part or Unit), Verification required?, Checklist required?, Weight
3. **Configuration → Process Routes** → Add step to relevant Part Type or Unit Type route
4. **Configuration → Checklists** → Add template if the process requires a checklist

New units/parts created after this automatically include the new step.

---

## Production Deployment Checklist

- [ ] Set `NODE_ENV=production` in API env
- [ ] Use strong, unique JWT secrets (64+ chars)
- [ ] Set `CORS_ORIGIN` to your actual domain
- [ ] Run `npm run db:migrate:deploy` (not `db:migrate`)
- [ ] Change admin seed credentials immediately
- [ ] Set up database backups (daily minimum)
- [ ] Configure a process manager (PM2 or Docker) for the API
- [ ] Use Next.js standalone output for the web app
- [ ] Put both services behind a reverse proxy (nginx/Caddy) with TLS

---

## Troubleshooting

**`npm run db:seed` fails with "already exists"**
Run `npm run db:reset` to start fresh (dev only).

**API starts but returns 500 on all requests**
Check DATABASE_URL in `apps/api/.env` matches your running postgres.

**Frontend shows blank page after login**
Check browser console for WebSocket errors. Verify NEXT_PUBLIC_WS_URL points to the API.

**"Cannot find module @hvacflow/shared-types"**
Run `npm install` from the root — workspace symlinks are set up by npm.

**TypeScript errors after schema change**
Run `npm run db:generate` to regenerate the Prisma client, then `npm run typecheck`.
