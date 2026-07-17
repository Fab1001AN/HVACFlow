/**
 * Clears every unit and everything attached to it - parts, production
 * tasks, comments, vendor parts, activity logs, rework records,
 * shipment records - so you can start fresh with new units.
 *
 * Does NOT touch any configuration: departments, process definitions,
 * part types, unit types, priority levels, roles/permissions, users,
 * or workflow stages all stay exactly as they are. Orders are also
 * untouched (Unit references Order, not the other way around, so
 * clearing units has no effect on them).
 *
 * Order matters here and isn't arbitrary:
 *   1. ProductionTask first - Part.unitId is a REQUIRED field with no
 *      cascade configured, and ProductionTask's own links to Part/Unit
 *      are optional with Prisma's default behavior (silently set to
 *      null, not deleted) - deleting tasks last would leave orphaned
 *      rows with no part/unit reference at all, invisible garbage in
 *      the database.
 *   2. Part second - same reasoning, clears the required Unit link
 *      before Unit rows go away.
 *   3. Unit last - everything with an explicit onDelete: Cascade to
 *      Unit (comments, vendor parts, activity log, rework, shipment
 *      records) is cleaned up automatically by Postgres at this step,
 *      no separate delete needed for those.
 *
 * Run with: npx ts-node --project tsconfig.seed.json prisma/clear-units.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing all units and everything linked to them...\n');

  const taskCount = await prisma.productionTask.deleteMany({});
  console.log(`  Deleted ${taskCount.count} production task(s)`);

  const partCount = await prisma.part.deleteMany({});
  console.log(`  Deleted ${partCount.count} part(s)`);

  const unitCount = await prisma.unit.deleteMany({});
  console.log(`  Deleted ${unitCount.count} unit(s) (comments, vendor parts, activity logs, rework, and shipment records for these were removed automatically along with them)`);

  console.log('\nDone. Configuration (departments, processes, part types, unit types, roles, users, workflow stages) was not touched.');
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
