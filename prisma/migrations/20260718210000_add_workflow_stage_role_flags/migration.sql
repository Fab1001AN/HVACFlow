-- Configurable role flags to replace hardcoded workflow-stage-name matches
-- in application code (white-label safety). gatesOnPartsComplete replaces
-- the "Unit Completed" name-match parts gate; isManagerBoundary replaces
-- the "Assembly Started" boundary lookups used by the Manager and Assembly
-- WIP views.
ALTER TABLE "workflow_stages" ADD COLUMN "gatesOnPartsComplete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "workflow_stages" ADD COLUMN "isManagerBoundary" BOOLEAN NOT NULL DEFAULT false;

-- Backfill the flags onto the stages that currently carry these roles by
-- name, so existing deployments keep identical behaviour after upgrade.
-- (New/renamed deployments set these via the config UI instead.)
UPDATE "workflow_stages" SET "gatesOnPartsComplete" = true WHERE "name" = 'Unit Completed';
UPDATE "workflow_stages" SET "isManagerBoundary" = true WHERE "name" = 'Assembly Started';
