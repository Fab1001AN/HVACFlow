-- Optional per-stage gate: block advancing a unit into this stage while any
-- of its bought-in vendor parts are still not received. Off by default, so
-- existing deployments are unaffected until an admin turns it on.
ALTER TABLE "workflow_stages" ADD COLUMN "gatesOnVendorPartsReceived" BOOLEAN NOT NULL DEFAULT false;
