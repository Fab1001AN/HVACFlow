# HVACFlow — Manufacturing Workflow Platform

A production-ready workflow tracking platform for HVAC manufacturing companies.
Tracks every part and unit from production planning through fabrication, assembly, testing, and dispatch.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | NestJS 11, Prisma 6, PostgreSQL 16 |
| Auth | JWT (access + refresh tokens), data-driven RBAC |
| Realtime | WebSockets (Socket.io) |
| Monorepo | Turborepo + npm workspaces |

## Architecture Principles

- **Universal Production Task Engine** — every manufacturing operation (Cutting, Bending, Foaming, Assembly, Electrical, Painting, Testing, Dispatch) is one row in one `ProductionTask` table. No hardcoded process names anywhere in code.
- **Fully configurable** — departments, processes, part types, unit types, unit composition, priority levels, checklists, roles, and permissions are all database rows editable through the application UI. Zero developer involvement required.
- **Part-level tracking** — unit progress is always computed from part progress, which is computed from task completion weights. Progress is never set directly.
- **Clean Architecture** — controllers → services → Prisma. Services own business logic. Controllers own HTTP. Infrastructure owns persistence.

## Quick Start

### Prerequisites

- Node.js 22 LTS
- Docker (for PostgreSQL)

### 1. Clone and install

```bash
git clone <repo>
cd hvacflow
cp .env.example .env
# Edit .env — set JWT secrets and passwords
npm install
```

### 2. Start PostgreSQL

```bash
docker-compose up -d postgres
```

### 3. Run database migrations and seed

```bash
npm run db:migrate
npm run db:seed
```

Default admin credentials (change immediately):
- Email: `admin@hvacflow.com`
- Password: `Admin@HVACFlow1`

### 4. Start development servers

```bash
npm run dev
```

- Frontend: http://localhost:3000
- API: http://localhost:4000/api/v1
- Swagger: http://localhost:4000/api/v1/docs

## Project Structure

```
hvacflow/
├── apps/
│   ├── api/              # NestJS backend
│   │   └── src/
│   │       ├── modules/  # Domain modules (auth, users, departments, production-tasks…)
│   │       ├── common/   # Guards, decorators, filters, Prisma service
│   │       └── config/   # Env validation
│   └── web/              # Next.js frontend
│       └── src/
│           ├── app/      # App Router pages
│           ├── features/ # Feature-scoped components and logic
│           ├── components/ # Shared UI components
│           ├── lib/      # API client, WebSocket client, utils
│           └── store/    # Zustand stores
├── packages/
│   └── shared-types/     # Enums and interfaces shared between api and web
└── prisma/
    ├── schema.prisma     # Complete database schema
    └── seed.ts           # Seed data (configurable defaults)
```

## Key Business Rules

1. **Part-driven progress** — `Unit.progressPercentage` is always derived from its parts' task completion. Never set directly.
2. **Task cascade** — completing a task automatically makes the next task in the sequence `Ready`.
3. **Verification gate** — processes with `requiresVerification=true` pass through `PendingVerification` before `Completed`. Configured per process, not hardcoded.
4. **Checklist gate** — processes with `requiresChecklist=true` require all mandatory checklist items checked before `complete` is allowed. Template managed in Configuration.
5. **Department scoping** — operators only see tasks from their assigned departments. Supervisors/Admins can view all with `task:view-all` permission.
6. **Fixed engine states** — `TaskStatus` enum is the only fixed code constant. Everything else is configurable data.

## Adding a New Manufacturing Process

No code changes required:

1. Go to **Configuration → Departments** → create the department if needed.
2. Go to **Configuration → Processes** → create the process definition (assign department, set `Applies To`, verification/checklist requirements, weight).
3. Go to **Configuration → Process Routes** → add the new step to the relevant Part Type or Unit Type routes.
4. (Optional) Go to **Configuration → Checklists** → create a checklist template for the new process.

All new units/parts created after this will include the new process step automatically.

## Production Deployment

```bash
# Build all apps
npm run build

# Deploy database migrations
npm run db:migrate:deploy

# Start API
node apps/api/dist/main.js

# Start Next.js
node apps/web/.next/standalone/server.js
```

Set all environment variables from `.env.example` with production values. Use strong, unique JWT secrets (minimum 64 characters).

## API Reference

Swagger documentation available at `/api/v1/docs` in development.

Core endpoints:
- `POST /api/v1/auth/login` — authenticate
- `GET /api/v1/mission-control/board` — live Kanban board
- `GET /api/v1/production-tasks` — department-scoped task list
- `POST /api/v1/production-tasks/:id/start|complete|verify|hold|resume|reject` — task actions
- Full reference in Swagger
