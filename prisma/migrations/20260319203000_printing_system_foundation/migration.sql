CREATE TABLE IF NOT EXISTS "PrintTemplate" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "defaultFormat" TEXT NOT NULL DEFAULT 'PDF',
    "templateHtml" TEXT NOT NULL,
    "templateJson" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "branchId" INTEGER,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PrintJob" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" INTEGER,
    "templateId" INTEGER,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "outputFormat" TEXT NOT NULL DEFAULT 'PDF',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "requestedById" INTEGER,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "fileName" TEXT,
    "fileUrl" TEXT,
    "errorMessage" TEXT,
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExportJob" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" INTEGER,
    "sourceType" TEXT NOT NULL,
    "sourceFilter" JSONB NOT NULL DEFAULT '{}',
    "outputFormat" TEXT NOT NULL DEFAULT 'XLSX',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "requestedById" INTEGER,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "rowsExported" INTEGER NOT NULL DEFAULT 0,
    "fileName" TEXT,
    "fileUrl" TEXT,
    "errorMessage" TEXT,
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ConversionJob" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" INTEGER,
    "sourceFileName" TEXT NOT NULL,
    "sourceFileUrl" TEXT,
    "sourceFormat" TEXT NOT NULL,
    "targetFormat" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "requestedById" INTEGER,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "outputFileName" TEXT,
    "outputFileUrl" TEXT,
    "errorMessage" TEXT,
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversionJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PrintAudit" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "format" TEXT,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "actorId" INTEGER,
    "printJobId" INTEGER,
    "exportJobId" INTEGER,
    "conversionJobId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintAudit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "number" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "outputFormat" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "approvalStatus" "ApprovalLifecycleStatus";
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "postingStatus" "PostingLifecycleStatus";
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "requestedById" INTEGER;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "requestedAt" TIMESTAMP(3);
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3);
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "fileUrl" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "attachmentsCount" INTEGER;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "createdById" INTEGER;
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "updatedById" INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PrintJob' AND column_name = 'jobKey'
  ) THEN
    EXECUTE 'UPDATE "PrintJob" SET "number" = COALESCE(NULLIF("number", ''''), NULLIF("jobKey", ''''))';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PrintJob' AND column_name = 'recordId'
  ) THEN
    EXECUTE 'UPDATE "PrintJob" SET "entityId" = COALESCE("entityId", CAST("recordId" AS TEXT))';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PrintJob' AND column_name = 'format'
  ) THEN
    EXECUTE 'UPDATE "PrintJob" SET "outputFormat" = COALESCE("outputFormat", NULLIF("format", ''''))';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PrintJob' AND column_name = 'requestedBy'
  ) THEN
    EXECUTE 'UPDATE "PrintJob" SET "requestedById" = COALESCE("requestedById", "requestedBy")';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PrintJob' AND column_name = 'attachmentId'
  ) THEN
    EXECUTE 'UPDATE "PrintJob" SET "attachmentsCount" = COALESCE("attachmentsCount", CASE WHEN "attachmentId" IS NULL THEN 0 ELSE 1 END)';
  ELSE
    EXECUTE 'UPDATE "PrintJob" SET "attachmentsCount" = COALESCE("attachmentsCount", 0)';
  END IF;
END $$;

UPDATE "PrintJob"
SET
  "number" = COALESCE(NULLIF("number", ''), 'PRN-LEGACY-' || "id"),
  "entityType" = COALESCE(NULLIF("entityType", ''), 'UNKNOWN'),
  "outputFormat" = COALESCE(NULLIF("outputFormat", ''), 'PDF'),
  "status" = COALESCE(NULLIF("status", ''), 'QUEUED'),
  "approvalStatus" = COALESCE("approvalStatus", 'DRAFT'),
  "postingStatus" = COALESCE("postingStatus", 'NOT_APPLICABLE'),
  "requestedAt" = COALESCE("requestedAt", "createdAt", CURRENT_TIMESTAMP),
  "createdAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
  "updatedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP);

ALTER TABLE "PrintJob" ALTER COLUMN "number" SET NOT NULL;
ALTER TABLE "PrintJob" ALTER COLUMN "entityType" SET NOT NULL;
ALTER TABLE "PrintJob" ALTER COLUMN "outputFormat" SET DEFAULT 'PDF';
ALTER TABLE "PrintJob" ALTER COLUMN "outputFormat" SET NOT NULL;
ALTER TABLE "PrintJob" ALTER COLUMN "status" SET DEFAULT 'QUEUED';
ALTER TABLE "PrintJob" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "PrintJob" ALTER COLUMN "approvalStatus" SET DEFAULT 'DRAFT';
ALTER TABLE "PrintJob" ALTER COLUMN "approvalStatus" SET NOT NULL;
ALTER TABLE "PrintJob" ALTER COLUMN "postingStatus" SET DEFAULT 'NOT_APPLICABLE';
ALTER TABLE "PrintJob" ALTER COLUMN "postingStatus" SET NOT NULL;
ALTER TABLE "PrintJob" ALTER COLUMN "requestedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PrintJob" ALTER COLUMN "requestedAt" SET NOT NULL;
ALTER TABLE "PrintJob" ALTER COLUMN "attachmentsCount" SET DEFAULT 0;
ALTER TABLE "PrintJob" ALTER COLUMN "attachmentsCount" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrintTemplate_branchId_fkey') THEN
    ALTER TABLE "PrintTemplate"
    ADD CONSTRAINT "PrintTemplate_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PrintJob' AND column_name = 'branchId'
    )
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrintJob_branchId_fkey')
  THEN
    ALTER TABLE "PrintJob"
    ADD CONSTRAINT "PrintJob_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PrintJob' AND column_name = 'templateId'
    )
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrintJob_templateId_fkey')
  THEN
    ALTER TABLE "PrintJob"
    ADD CONSTRAINT "PrintJob_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "PrintTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExportJob_branchId_fkey') THEN
    ALTER TABLE "ExportJob"
    ADD CONSTRAINT "ExportJob_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConversionJob_branchId_fkey') THEN
    ALTER TABLE "ConversionJob"
    ADD CONSTRAINT "ConversionJob_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrintAudit_branchId_fkey') THEN
    ALTER TABLE "PrintAudit"
    ADD CONSTRAINT "PrintAudit_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrintAudit_printJobId_fkey') THEN
    ALTER TABLE "PrintAudit"
    ADD CONSTRAINT "PrintAudit_printJobId_fkey"
    FOREIGN KEY ("printJobId") REFERENCES "PrintJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrintAudit_exportJobId_fkey') THEN
    ALTER TABLE "PrintAudit"
    ADD CONSTRAINT "PrintAudit_exportJobId_fkey"
    FOREIGN KEY ("exportJobId") REFERENCES "ExportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrintAudit_conversionJobId_fkey') THEN
    ALTER TABLE "PrintAudit"
    ADD CONSTRAINT "PrintAudit_conversionJobId_fkey"
    FOREIGN KEY ("conversionJobId") REFERENCES "ConversionJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "PrintTemplate_key_key" ON "PrintTemplate"("key");
CREATE INDEX IF NOT EXISTS "PrintTemplate_branchId_status_idx" ON "PrintTemplate"("branchId", "status");
CREATE INDEX IF NOT EXISTS "PrintTemplate_entityType_status_idx" ON "PrintTemplate"("entityType", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "PrintJob_number_key" ON "PrintJob"("number");
CREATE INDEX IF NOT EXISTS "PrintJob_branchId_requestedAt_idx" ON "PrintJob"("branchId", "requestedAt");
CREATE INDEX IF NOT EXISTS "PrintJob_status_outputFormat_idx" ON "PrintJob"("status", "outputFormat");
CREATE INDEX IF NOT EXISTS "PrintJob_templateId_idx" ON "PrintJob"("templateId");

CREATE UNIQUE INDEX IF NOT EXISTS "ExportJob_number_key" ON "ExportJob"("number");
CREATE INDEX IF NOT EXISTS "ExportJob_branchId_requestedAt_idx" ON "ExportJob"("branchId", "requestedAt");
CREATE INDEX IF NOT EXISTS "ExportJob_status_outputFormat_idx" ON "ExportJob"("status", "outputFormat");

CREATE UNIQUE INDEX IF NOT EXISTS "ConversionJob_number_key" ON "ConversionJob"("number");
CREATE INDEX IF NOT EXISTS "ConversionJob_branchId_requestedAt_idx" ON "ConversionJob"("branchId", "requestedAt");
CREATE INDEX IF NOT EXISTS "ConversionJob_status_sourceFormat_targetFormat_idx" ON "ConversionJob"("status", "sourceFormat", "targetFormat");

CREATE INDEX IF NOT EXISTS "PrintAudit_branchId_createdAt_idx" ON "PrintAudit"("branchId", "createdAt");
CREATE INDEX IF NOT EXISTS "PrintAudit_resourceType_resourceId_idx" ON "PrintAudit"("resourceType", "resourceId");
CREATE INDEX IF NOT EXISTS "PrintAudit_action_status_idx" ON "PrintAudit"("action", "status");
