-- Terminal-stage flag: a unit on a terminal stage is finished as far as
-- active production dashboards care, so it drops off the work lists.
-- Deployment-configurable (white-label) rather than hardcoded by stage
-- name in application code.
ALTER TABLE "workflow_stages" ADD COLUMN "isTerminal" BOOLEAN NOT NULL DEFAULT false;

-- One-time backfill: the old deriveUnitStatus() wrote status='Dispatched'
-- the moment a unit's last task/part completed (at assembly-done), which
-- was wrong - that point is production-Completed, not dispatched. Every
-- existing 'Dispatched' row therefore actually means "all production work
-- done", which is now 'Completed'. Correct them in place so the status
-- badge is accurate immediately on deploy instead of waiting for a task
-- recompute that a finished unit will never trigger (it has no remaining
-- tasks). Dashboard visibility is unaffected either way - exclusion now
-- keys off the workflow stage's isTerminal flag, not unit.status.
UPDATE "units" SET "status" = 'Completed' WHERE "status" = 'Dispatched';
