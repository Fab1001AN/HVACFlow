# HVACFlow Unit-Centred Planning Release

This package refactors HVACFlow toward the confirmed manufacturing workflow. The mandatory Customer → Project → Order chain is no longer required for production planning.

## Delivered in this release

### Production Calendar
- New `/production-calendar` page after login.
- Direct unit creation with unit number, type, priority, planned month, due date, and OneDrive folder.
- Native drag-and-drop movement of unit cards between months.
- Unit cards show type, priority, current stage, progress, parts count, due date, block reason, and OneDrive availability.

### Unit-centred API
- `GET /api/v1/units`
- `GET /api/v1/units/calendar`
- `GET /api/v1/units/director-summary`
- `POST /api/v1/units`
- `PATCH /api/v1/units/:id/move`
- `POST /api/v1/units/:id/comments`
- Existing order-based unit routes remain available for backward compatibility.

### Director dashboard
- New `/director-dashboard` page.
- Active, blocked, delayed, testing, and ready-to-dispatch totals.
- Units requiring attention with delay/block context.
- Department workload based on open production tasks.

### Engineering and file readiness
Each unit now tracks:
- Submittal received
- Design complete
- Drawings available
- Programming files complete
- Cutting programs available
- OneDrive folder URL

The unit detail page includes readiness controls, production comments, and delay comments.

### Data model
The `Unit` model now supports direct planning without an order and includes dates, priority position, current department/stage, block state, readiness flags, and OneDrive URL. A `UnitComment` model records production updates and delay reasons.

### Configurable seed data
The seed now includes Engineering, Design & Programming, Fabrication, Foaming, Assembly, Electrical, Piping, Painting, Miscellaneous Finishing, Testing & Quality, and Dispatch. Unit types include RTU, MUA, AHU, ERV, Split System, FCU, and Custom.

## Install the database change

From the repository root:

```powershell
npm.cmd install
npm.cmd run db:generate
npm.cmd run db:migrate:deploy
npm.cmd run db:seed
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

For a development database where you want Prisma to create a named migration interactively instead of applying the supplied SQL migration:

```powershell
npm.cmd run db:migrate -- --name unit_centered_planning
```

Back up production data before applying any schema migration.

## Main URLs

- Production Calendar: `http://localhost:3000/production-calendar`
- Director Dashboard: `http://localhost:3000/director-dashboard`
- Department Work: `http://localhost:3000/mission-control`
- API Docs: `http://localhost:4000/api/v1/docs`

## Verification performed

- Shared-types TypeScript build passed.
- Web TypeScript check passed.
- Next.js source compilation and type validation passed. The environment timed out during the later page-data phase of `next build`, so run the complete build locally after applying the Prisma migration and generating the client.
- Prisma client generation could not be completed in this environment because the Prisma binary host was temporarily unreachable. Run `npm.cmd run db:generate` locally before API typecheck/build.

## Next implementation milestones

This release establishes the correct unit-centred foundation. The next milestones are visual routing with parallel branches, department notifications, advanced fabrication/assembly checklists, and richer timeline analytics. Existing configurable process routes, compositions, checklists, task engine, permissions, and WebSockets remain in place to support those milestones.
