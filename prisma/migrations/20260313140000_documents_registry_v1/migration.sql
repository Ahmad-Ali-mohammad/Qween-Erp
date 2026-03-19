CREATE TABLE "DocumentVersion" (
    "id" SERIAL NOT NULL,
    "documentKey" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT,
    "entityType" TEXT,
    "entityId" INTEGER,
    "attachmentId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CorrespondenceRegister" (
    "id" SERIAL NOT NULL,
    "direction" TEXT NOT NULL,
    "reference" TEXT,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "entityType" TEXT,
    "entityId" INTEGER,
    "documentKey" TEXT,
    "attachmentId" INTEGER,
    "receivedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrespondenceRegister_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentVersion_documentKey_versionNumber_key" ON "DocumentVersion"("documentKey", "versionNumber");
CREATE INDEX "DocumentVersion_documentKey_createdAt_idx" ON "DocumentVersion"("documentKey", "createdAt");
CREATE INDEX "DocumentVersion_entityType_entityId_idx" ON "DocumentVersion"("entityType", "entityId");

CREATE INDEX "CorrespondenceRegister_direction_status_createdAt_idx" ON "CorrespondenceRegister"("direction", "status", "createdAt");
CREATE INDEX "CorrespondenceRegister_entityType_entityId_idx" ON "CorrespondenceRegister"("entityType", "entityId");
CREATE INDEX "CorrespondenceRegister_documentKey_idx" ON "CorrespondenceRegister"("documentKey");

ALTER TABLE "DocumentVersion"
    ADD CONSTRAINT "DocumentVersion_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CorrespondenceRegister"
    ADD CONSTRAINT "CorrespondenceRegister_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
