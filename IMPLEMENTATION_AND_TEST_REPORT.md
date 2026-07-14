# HVACFlow Unit-Centered Workflow Update

## Implemented
- Root workspace scripts no longer depend on Turbo for dev/build/typecheck.
- Added `Start-HVACFlow.bat`.
- Replaced planned start date UI with Production Month (month/year).
- Calendar drag/drop accepts the whole month column, highlights the target, uses optimistic updates, and restores cards after API failure.
- Added ordered Engineering workflow:
  Not Started → Submittal Received → Designing Started → Unit Design Completed → Drawings Completed → Programming Completed → Released to Manufacturing.
- Added Manager Dashboard and whole-unit release (Option A).
- Added department supervisor work page grouped by unit.
- Fabrication/department supervisor starts the entire unit once; first routed task for every part becomes Ready.
- Added one-click Task Completed for Ready/InProgress tasks and automatic next-route activation.
- Added controlled replacement of pending route steps for already-created parts; active/completed history remains locked.
- Foaming is migrated under Fabrication and the old Foaming department is deactivated.
- Sub-Assembly is marked optional and process configuration exposes an Optional Process checkbox.
- Added schema fields for production month, engineering state, release state, release timestamps, and manufacturing start.
- Added manager/engineering/dashboard access permission seeds.

## Validation performed in this sandbox
- `npm ci --ignore-scripts`: PASS
- shared-types build: PASS
- web TypeScript typecheck: PASS
- initial Next production compilation: PASS through compile/type validation; static generation was terminated by sandbox constraints.

## Sandbox limitations
- Prisma client generation could not run because this environment cannot resolve `binaries.prisma.sh`. API typecheck therefore cannot be meaningfully completed here because `@prisma/client` remains ungenerated.
- A later Next build attempted to download SWC fallback packages and failed due the same network policy. The source-level web typecheck was rerun after a clean install and passed.
- PostgreSQL/Docker runtime and browser end-to-end testing must be executed on the Windows work computer where Docker and Prisma were already confirmed working.

## Required real-machine verification
From the repository root:

```powershell
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run typecheck
npm run build
.\Start-HVACFlow.bat
```

Then test:
1. Create a unit with a production month.
2. Drag it between month columns and blank column space.
3. Advance all Engineering stages in order.
4. Confirm Manager cannot release before Engineering release.
5. Release the entire unit.
6. Open Department Work, select Fabrication, and start the whole unit.
7. Complete a part card once and confirm it leaves the current process and appears at its next routed process.
8. Confirm optional Sub-Assembly can be excluded from routes.
9. Replace pending route steps for an existing part and confirm completed history remains unchanged.
10. Verify supervisor department restrictions and Admin configuration access.
