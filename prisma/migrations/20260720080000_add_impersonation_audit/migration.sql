-- Accountability trail for "view as" / impersonation previews. Records who
-- previewed whom and when. The preview itself is read-only (enforced in
-- application code); this table exists purely for auditing. Names are
-- denormalised so the record survives if either account is later deleted.
CREATE TABLE "impersonation_audits" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "targetUserId" TEXT,
    "adminName" TEXT NOT NULL,
    "targetUserName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "impersonation_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "impersonation_audits_createdAt_idx" ON "impersonation_audits"("createdAt");
CREATE INDEX "impersonation_audits_adminId_createdAt_idx" ON "impersonation_audits"("adminId", "createdAt");

ALTER TABLE "impersonation_audits" ADD CONSTRAINT "impersonation_audits_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "impersonation_audits" ADD CONSTRAINT "impersonation_audits_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
