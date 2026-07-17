-- Rework: separate from the workflow engine on purpose - a completed
-- unit is never reopened, so this is its own linked record, not a
-- reversal of the unit's own state.
CREATE TYPE "ReworkStatus" AS ENUM ('Open', 'Completed');

ALTER TYPE "ActivityAction" ADD VALUE 'ReworkCreated';
ALTER TYPE "ActivityAction" ADD VALUE 'ReworkCompleted';
ALTER TYPE "ActivityAction" ADD VALUE 'ShipmentLogged';

CREATE TABLE "unit_reworks" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "issue" TEXT NOT NULL,
  "assignedToUserId" TEXT,
  "status" "ReworkStatus" NOT NULL DEFAULT 'Open',
  "notes" TEXT,
  "completedAt" TIMESTAMP(3),
  "reshippedAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "unit_reworks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "unit_reworks_unitId_idx" ON "unit_reworks"("unitId");

ALTER TABLE "unit_reworks" ADD CONSTRAINT "unit_reworks_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "unit_reworks" ADD CONSTRAINT "unit_reworks_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "unit_reworks" ADD CONSTRAINT "unit_reworks_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Shipment records: one-to-many per unit (reship after rework gets its
-- own new record, not an edit of the first shipment).
CREATE TABLE "shipment_records" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "carrierName" TEXT,
  "shipDate" TIMESTAMP(3),
  "truckNumber" TEXT,
  "trackingNumber" TEXT,
  "driverName" TEXT,
  "destinationConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "receivedBySignature" TEXT,
  "notes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shipment_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shipment_records_unitId_idx" ON "shipment_records"("unitId");

ALTER TABLE "shipment_records" ADD CONSTRAINT "shipment_records_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipment_records" ADD CONSTRAINT "shipment_records_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
