-- Unified unit activity timeline.
CREATE TYPE "ActivityAction" AS ENUM (
  'UnitCreated',
  'EngineeringAdvanced',
  'UnitPlanned',
  'UnitReleasedToProduction',
  'ManufacturingStarted',
  'AssemblyStarted',
  'TaskCompleted',
  'DelayReported',
  'VendorPartReceived',
  'VendorPartLogged',
  'UnitBlocked',
  'UnitUnblocked'
);

CREATE TABLE "activity_logs" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "userId" TEXT,
  "action" "ActivityAction" NOT NULL,
  "description" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "activity_logs_unitId_createdAt_idx" ON "activity_logs"("unitId", "createdAt");

ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
