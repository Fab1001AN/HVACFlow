-- Adds a "Planned" stage to ProductionReleaseStatus, sitting between
-- Engineering's release and the Production Manager's release-to-
-- Fabrication step. A Planner now owns assigning parts to a unit before
-- it's handed to the Production Manager.
ALTER TYPE "ProductionReleaseStatus" ADD VALUE 'Planned' AFTER 'AwaitingRelease';
