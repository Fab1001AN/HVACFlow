-- Step 2 of the workflow-configurability plan: generic, admin-defined
-- pipeline stages. Built as new, additive infrastructure alongside the
-- existing hardcoded Engineering/Planner/Manager/Assembly flow, which
-- this migration does not touch or modify in any way. Migrating the
-- real pipeline onto this is a deliberately separate, later step.

ALTER TYPE "ActivityAction" ADD VALUE 'WorkflowStageAdvanced';
ALTER TYPE "ActivityAction" ADD VALUE 'WorkflowStageMovedBack';
ALTER TYPE "ActivityAction" ADD VALUE 'WorkflowStageSet';

CREATE TABLE "workflow_stages" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "departmentId" TEXT,
  "requiredPermission" TEXT NOT NULL,
  "actionLabel" TEXT NOT NULL DEFAULT 'Advance',
  "allowsBackward" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workflow_stages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_stages_name_key" ON "workflow_stages"("name");
CREATE INDEX "workflow_stages_sortOrder_idx" ON "workflow_stages"("sortOrder");

ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "units" ADD COLUMN "currentWorkflowStageId" TEXT;
ALTER TABLE "units" ADD CONSTRAINT "units_currentWorkflowStageId_fkey" FOREIGN KEY ("currentWorkflowStageId") REFERENCES "workflow_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
