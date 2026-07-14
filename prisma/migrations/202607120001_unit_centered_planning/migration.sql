-- Unit-centred production planning foundation
ALTER TABLE "units" ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE "units"
  ADD COLUMN "priorityLevelId" TEXT,
  ADD COLUMN "currentDepartmentId" TEXT,
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "plannedStartDate" TIMESTAMP(3),
  ADD COLUMN "dueDate" TIMESTAMP(3),
  ADD COLUMN "priorityPosition" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "currentStage" TEXT,
  ADD COLUMN "isBlocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "holdReason" TEXT,
  ADD COLUMN "oneDriveFolderUrl" TEXT,
  ADD COLUMN "submittalReceived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "designComplete" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "drawingsAvailable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "programmingFilesComplete" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cuttingProgramsAvailable" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "unit_comments" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "isDelay" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "unit_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "units_priorityLevelId_idx" ON "units"("priorityLevelId");
CREATE INDEX "units_currentDepartmentId_idx" ON "units"("currentDepartmentId");
CREATE INDEX "units_plannedStartDate_idx" ON "units"("plannedStartDate");
CREATE INDEX "units_dueDate_idx" ON "units"("dueDate");
CREATE INDEX "unit_comments_unitId_createdAt_idx" ON "unit_comments"("unitId", "createdAt");

ALTER TABLE "units" ADD CONSTRAINT "units_priorityLevelId_fkey" FOREIGN KEY ("priorityLevelId") REFERENCES "priority_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "units" ADD CONSTRAINT "units_currentDepartmentId_fkey" FOREIGN KEY ("currentDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "unit_comments" ADD CONSTRAINT "unit_comments_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "unit_comments" ADD CONSTRAINT "unit_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
