-- Purchasing department support: vendor-supplied parts (HX coils,
-- motors, fans, etc.) tracked separately from fabricated Parts. No
-- process routing - just received/pending status and dates.

-- PartType gets a sourceType so the UI can tell fabricated part types
-- (shown in the Planner's palette) apart from vendor part types (shown
-- in the Purchasing/Assembly vendor-part palette).
CREATE TYPE "PartSourceType" AS ENUM ('Fabricated', 'Vendor');
ALTER TABLE "part_types" ADD COLUMN "sourceType" "PartSourceType" NOT NULL DEFAULT 'Fabricated';

-- Captured when Assembly clicks "Start Building Unit".
ALTER TABLE "units" ADD COLUMN "assignedTeamName" TEXT;
ALTER TABLE "units" ADD COLUMN "assemblyStartedAt" TIMESTAMP(3);

CREATE TABLE "vendor_parts" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "partTypeId" TEXT NOT NULL,
  "isReceived" BOOLEAN NOT NULL DEFAULT false,
  "expectedArrivalDate" TIMESTAMP(3),
  "receivedDate" TIMESTAMP(3),
  "addedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vendor_parts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vendor_parts_unitId_idx" ON "vendor_parts"("unitId");

ALTER TABLE "vendor_parts" ADD CONSTRAINT "vendor_parts_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_parts" ADD CONSTRAINT "vendor_parts_partTypeId_fkey" FOREIGN KEY ("partTypeId") REFERENCES "part_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_parts" ADD CONSTRAINT "vendor_parts_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
