-- Singleton settings row for customer-editable branding (app name today,
-- logo/etc. later). One row per deployment - each customer gets their
-- own separate install rather than shared multi-tenant infrastructure,
-- so no organizationId scoping is needed anywhere else in the schema.
CREATE TABLE "organization_settings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "name" TEXT NOT NULL DEFAULT 'HVACFlow',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "organization_settings" ("id", "name", "updatedAt")
VALUES ('default', 'HVACFlow', CURRENT_TIMESTAMP);
