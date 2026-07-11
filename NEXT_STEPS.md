# HVACFlow — Next Steps & Development Roadmap

The current codebase is a complete, running foundation. Every architectural
decision, data model, business rule, and configurable element is implemented.
The steps below complete the product for commercial readiness.

---

## Immediate (Before First Real User)

### 1. Install shadcn/ui Components
The UI uses shadcn's design tokens and class patterns but components are built
from scratch. Installing the official library gives you polished Radix-backed
components for free:

```bash
cd apps/web
npx shadcn@latest init
npx shadcn@latest add dialog dropdown-menu select toast badge progress avatar
npx shadcn@latest add table tabs command popover
```

Then replace the hand-built `Modal`, `Select`, `Badge` in
`src/components/shared/index.tsx` with the shadcn versions.

### 2. Generate a Real Database Migration
The schema is written but no migration file exists yet:

```bash
npm run db:migrate -- --name init
```

Commit the generated `prisma/migrations/` folder — this is your schema history.

### 3. Add next.config.ts `apps` Array for Standalone Output
For production deployment add to `apps/web/next.config.ts`:
```ts
output: 'standalone',
```

### 4. Replace Dev JWT Secrets
Generate production secrets before any real data is entered:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Phase 2 — Complete the UI (1–2 weeks)

### 5. Part identifier auto-generation
Currently parts get a timestamp-based identifier. Replace with a configurable
pattern (e.g. `{unitSerial}-{partTypeCode}-{seq}`) set in Configuration.

`apps/api/src/modules/units/units.service.ts` → `createPartWithTasks()` method.

### 6. Unit Specifications UI
Units have a `specifications` JSON field but no UI to enter key/value pairs.
Add a dynamic key/value editor on the Create Unit modal in
`apps/web/src/app/(dashboard)/orders/[id]/page.tsx`.

### 7. Optional Parts confirmation dialog
When a unit is created and optional parts are returned, show a confirmation
dialog listing the optional parts with checkboxes before auto-creating them.
Hook: `api.units.create()` returns `optionalParts[]` — display these.

### 8. Task reassignment from Kanban
Add a right-click or ⋮ menu on Kanban cards for Reassign, Hold, Reject
without opening the full drawer. Updates `assignedUserId` via
`PATCH /production-tasks/:id`.

### 9. Live elapsed timer on in-progress cards
The Kanban card shows elapsed time but it's static. Add a `useInterval`
hook that ticks every minute to update the displayed elapsed time without
a WebSocket event.

### 10. Mobile swipe gestures on Kanban
Add touch-based column swiping. Consider `@use-gesture/react` for the
horizontal swipe between department columns on mobile.

---

## Phase 3 — Reporting & Analytics (2–3 weeks)

### 11. Unit Audit Trail Page
Build `/units/[id]/audit` using `GET /units/:id/audit-trail`. Show a
timeline view of every status transition across all parts.

### 12. Department Throughput Report
New page: tasks completed per department per day/week, average duration vs
estimated, on-hold rate. Uses `GET /reports/tasks` with date range filter.

### 13. CSV Export button
Add export buttons to the task list view and the audit trail pages.
`GET /reports/tasks?format=csv` already exists in the API.

### 14. Order Progress Dashboard
A summary view of all orders with their overall progress bars, estimated
vs actual delivery, and bottleneck identification (departments with most
on-hold tasks).

---

## Phase 4 — Production Operations (2–3 weeks)

### 15. Email Notifications
When a task becomes Ready, notify the assigned user (or department supervisor).
Add `@nestjs-modules/mailer` to the API.

Integration point: `workflow-progress.service.ts` → `activateNextTask()` method.
After setting next task to Ready, emit an email event.

### 16. Task Comments Thread
Extend `ProductionTask` with a `TaskComment` table (id, taskId, userId, message,
createdAt). Add a comments thread below the Notes section in the task drawer.
Useful for multi-shift handover notes.

### 17. QR Code / Barcode Scanning
For shop floor tablet use: generate a QR code per unit/part that links directly
to `/units/:id` or `/parts/:id`. Shop floor operators scan and jump straight
to the task chain.

Libraries: `qrcode` (npm) for generation, `html5-qrcode` for scanning.

### 18. Offline Mode for Task Completion
The Kanban board needs connectivity. Add a basic service worker that queues
task start/complete actions while offline and syncs when reconnected.
Critical for shop floors with poor WiFi near machinery.

### 19. Bulk Task Assignment
Supervisors often assign an entire department's Ready tasks to operators at
start of shift. Add a "Assign All Ready" action on each Kanban column that
bulk-updates `assignedUserId` via `PATCH /production-tasks/:id`.

### 20. Machine Utilization Tracking
Machines are optionally assigned to tasks. Add a report showing machine
utilization rate (hours used / shift hours) and queue depth per machine.

---

## Phase 5 — Enterprise Readiness (Ongoing)

### 21. Multi-tenant / Company isolation
If HVACFlow will serve multiple customers (SaaS), add a `tenantId` to every
table and filter every query by it. This is best done now before data volumes
grow. Add a `Tenant` table and a `TenantId` header or subdomain-based routing.

### 22. Role-based field visibility
Some customers want operators to see only their assigned tasks, not all tasks
in their department. Add a `fieldVisibility` JSON on `RoleDashboardConfig` that
controls which task card fields are visible per role.

### 23. SSO / SAML / OIDC
Enterprise customers will require single sign-on. Add Passport strategies for
OAuth2/OIDC (Google Workspace, Microsoft Entra) via `passport-openidconnect`.
The JWT and RBAC system works unchanged — SSO just becomes an additional
authentication pathway.

### 24. API Rate Limiting
Add `@nestjs/throttler` to the API. Critical before public/multi-tenant exposure.
Apply per-user rate limits on mutating endpoints.

### 25. Redis-backed WebSocket scaling
The current WebSocket gateway uses in-memory Socket.io rooms. If you run
multiple API instances behind a load balancer, add Redis adapter:
```bash
npm install @socket.io/redis-adapter ioredis
```
Update `realtime.module.ts` to use the Redis adapter.

### 26. Automated Testing Suite
Priority order:
1. Unit tests for `WorkflowProgressService` (progress calculation math)
2. Unit tests for `ProductionTasksService` (state transition guards)
3. Integration tests for the full Create Unit → Task Engine flow
4. E2E tests with Playwright for Mission Control + Task Drawer

---

## Architecture Notes for Future Developers

### The one rule that must never be broken
**`Unit.progressPercentage` and `Part.progressPercentage` are read-only.**
They are computed exclusively by `WorkflowProgressService.recomputePart()`
and `recomputeUnit()`. Any feature that looks like it needs to "set progress"
should instead change task statuses and let the engine recompute.

### Adding a new configurable entity
Pattern to follow for anything new that should be configurable through the UI:
1. Add a Prisma model with `isActive boolean default true`
2. Create a NestJS module with service + controller (CRUD + soft-delete guard)
3. Add seed rows (not hardcoded values in business logic)
4. Add a Configuration page in the frontend
5. Add permission codes for `:view` and `:manage`
6. Add those permissions to the appropriate role seeds

### The WebSocket contract is append-only
Do not remove or rename existing WebSocket event names (`task.statusChanged`,
`part.progressChanged`, etc.) without a versioning strategy. Mobile apps or
third-party integrators may depend on them.

### Process routes are immutable for existing tasks
Changing a `ProcessRoute` does not retroactively update existing
`ProductionTask` records. This is intentional — it preserves traceability.
New parts/units created after the route change pick up the new sequence.
