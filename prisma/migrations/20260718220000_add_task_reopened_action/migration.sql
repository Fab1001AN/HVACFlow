-- Reopening a previously-completed task (e.g. after QC finds a defect that
-- requires redoing work) needs its own audit-trail action, distinct from a
-- normal completion or a task rejection.
ALTER TYPE "ActivityAction" ADD VALUE 'TaskReopened';
