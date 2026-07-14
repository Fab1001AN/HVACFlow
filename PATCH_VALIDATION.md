# HVACFlow Focused Patch Validation

## Fixed in this patch

1. Production Calendar drag/drop
   - Drag starts only from the visible grip handle.
   - Unit id is stored in `dataTransfer`, with a ref fallback.
   - Entire month column and its blank space accept drops.
   - Optimistic movement rolls back on API failure.
   - Target month receives a clear visual highlight.

2. Left navigation order
   - Main dashboard links can be dragged and resequenced while the sidebar is expanded.
   - The chosen order is stored in browser local storage per browser profile.

3. Manager/Fabrication/department visibility
   - Manager release automatically assigns the unit to the active Fabrication department.
   - No department-selection step is required during release.
   - Manager summary now aggregates each unit's visible part stage by department.
   - Manager dashboard shows part/process/status information grouped by department.
   - Only Fabrication shows released units available for `Start Entire Unit`.
   - Department Work automatically prefers the logged-in user's assigned department and shows only that department's routed tasks.
   - Completing a task updates the unit's current department and current process to the next routed task.

4. Process configuration
   - Add and edit controls remain permanently visible.
   - Delete permanently removes an unused process.
   - A process referenced by production history or routes is safely archived instead of causing a blocking error.
   - Archived processes are hidden by default and can be shown/re-enabled.

## Validation completed in the packaging environment

- Shared types build: passed.
- Web TypeScript typecheck: passed.

## Validation required on Windows

The packaging environment could not regenerate Prisma's platform-specific client and its npm installation was incomplete. Run these on the Windows work computer after extracting this patch:

```powershell
npm install
npm run db:generate
npm run typecheck
npm run build
```

No new Prisma schema migration is required by this focused patch.
