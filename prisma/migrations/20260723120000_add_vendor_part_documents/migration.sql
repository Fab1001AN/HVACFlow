-- Supplier purchase-order / reference number on a vendor part. Free text,
-- since every supplier formats theirs differently.
ALTER TABLE "vendor_parts" ADD COLUMN "poReference" TEXT;
CREATE INDEX "vendor_parts_poReference_idx" ON "vendor_parts"("poReference");

-- Supporting evidence for vendor deliveries: a photographed or screenshotted
-- delivery note, order confirmation, supplier email, etc.
--
-- Bytes are stored in the database rather than on disk on purpose: the backup
-- script dumps the database only, so filesystem uploads would be silently
-- absent from every backup. Keeping them here means proof is covered by the
-- existing backup/restore, with no orphaned files to manage.
CREATE TABLE "vendor_part_documents" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "note" TEXT,
    "uploadedById" TEXT,
    "uploadedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vendor_part_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vendor_part_documents_createdAt_idx" ON "vendor_part_documents"("createdAt");

ALTER TABLE "vendor_part_documents"
    ADD CONSTRAINT "vendor_part_documents_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- One delivery note often covers several parts, and a part can accumulate
-- several documents over time, so this is many-to-many.
CREATE TABLE "vendor_part_document_links" (
    "vendorPartId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    CONSTRAINT "vendor_part_document_links_pkey" PRIMARY KEY ("vendorPartId","documentId")
);

CREATE INDEX "vendor_part_document_links_documentId_idx" ON "vendor_part_document_links"("documentId");

ALTER TABLE "vendor_part_document_links"
    ADD CONSTRAINT "vendor_part_document_links_vendorPartId_fkey"
    FOREIGN KEY ("vendorPartId") REFERENCES "vendor_parts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vendor_part_document_links"
    ADD CONSTRAINT "vendor_part_document_links_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "vendor_part_documents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
