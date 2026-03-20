DO $$
BEGIN
  CREATE TYPE "ApprovalLifecycleStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PostingLifecycleStatus" AS ENUM ('UNPOSTED', 'POSTED', 'REVERSED', 'NOT_APPLICABLE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "DocumentProvider" AS ENUM ('LOCAL', 'S3');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Branch" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "nameAr" TEXT NOT NULL,
  "nameEn" TEXT,
  "city" TEXT,
  "address" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "nameEn" TEXT;
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS "Branch_code_key" ON "Branch"("code");

CREATE TABLE IF NOT EXISTS "ApprovalWorkflow" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "nameAr" TEXT NOT NULL,
  "nameEn" TEXT,
  "entityType" TEXT NOT NULL,
  "branchId" INTEGER,
  "thresholdAmount" DECIMAL(65,30),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "steps" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalWorkflow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ApprovalWorkflow_code_key" ON "ApprovalWorkflow"("code");
CREATE INDEX IF NOT EXISTS "ApprovalWorkflow_entityType_idx" ON "ApprovalWorkflow"("entityType");
CREATE INDEX IF NOT EXISTS "ApprovalWorkflow_branchId_idx" ON "ApprovalWorkflow"("branchId");

CREATE TABLE IF NOT EXISTS "Document" (
  "id" SERIAL NOT NULL,
  "module" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "branchId" INTEGER,
  "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
  "provider" "DocumentProvider" NOT NULL DEFAULT 'LOCAL',
  "fileName" TEXT NOT NULL,
  "originalName" TEXT,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL DEFAULT 0,
  "bucket" TEXT,
  "storageKey" TEXT NOT NULL,
  "checksum" TEXT,
  "ocrText" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "versionNumber" INTEGER NOT NULL DEFAULT 1,
  "uploadedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Document_module_entityType_entityId_idx" ON "Document"("module", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "Document_branchId_idx" ON "Document"("branchId");
CREATE UNIQUE INDEX IF NOT EXISTS "Document_storageKey_versionNumber_key" ON "Document"("storageKey", "versionNumber");

CREATE TABLE IF NOT EXISTS "OutboxEvent" (
  "id" SERIAL NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" INTEGER,
  "branchId" INTEGER,
  "correlationId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL,
  "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OutboxEvent_eventId_key" ON "OutboxEvent"("eventId");
CREATE INDEX IF NOT EXISTS "OutboxEvent_status_createdAt_idx" ON "OutboxEvent"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "OutboxEvent_aggregateType_aggregateId_idx" ON "OutboxEvent"("aggregateType", "aggregateId");
CREATE INDEX IF NOT EXISTS "OutboxEvent_branchId_idx" ON "OutboxEvent"("branchId");

CREATE TABLE IF NOT EXISTS "EventConsumption" (
  "id" SERIAL NOT NULL,
  "consumerName" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "outboxEventId" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'CONSUMED',
  "result" JSONB,
  "errorMessage" TEXT,
  "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventConsumption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventConsumption_consumerName_eventId_key" ON "EventConsumption"("consumerName", "eventId");
CREATE INDEX IF NOT EXISTS "EventConsumption_outboxEventId_idx" ON "EventConsumption"("outboxEventId");

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "attachmentsCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Project_branchId_idx" ON "Project"("branchId");

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "attachmentsCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Customer_branchId_idx" ON "Customer"("branchId");

ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "attachmentsCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Supplier_branchId_idx" ON "Supplier"("branchId");

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'UNPOSTED';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "attachmentsCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Invoice_branchId_idx" ON "Invoice"("branchId");

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'UNPOSTED';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "attachmentsCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Payment_branchId_idx" ON "Payment"("branchId");

ALTER TABLE "FixedAsset" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "FixedAsset" ADD COLUMN IF NOT EXISTS "attachmentsCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "FixedAsset_branchId_idx" ON "FixedAsset"("branchId");

ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "attachmentsCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Warehouse_branchId_idx" ON "Warehouse"("branchId");

ALTER TABLE "SalesQuote" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "SalesQuote" ADD COLUMN IF NOT EXISTS "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "SalesQuote" ADD COLUMN IF NOT EXISTS "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE';
ALTER TABLE "SalesQuote" ADD COLUMN IF NOT EXISTS "attachmentsCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "SalesQuote_branchId_idx" ON "SalesQuote"("branchId");

ALTER TABLE "SalesReturn" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "SalesReturn" ADD COLUMN IF NOT EXISTS "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "SalesReturn" ADD COLUMN IF NOT EXISTS "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'UNPOSTED';
ALTER TABLE "SalesReturn" ADD COLUMN IF NOT EXISTS "attachmentsCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "SalesReturn_branchId_idx" ON "SalesReturn"("branchId");

ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE';
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "attachmentsCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "PurchaseOrder_branchId_idx" ON "PurchaseOrder"("branchId");

ALTER TABLE "PurchaseReturn" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "PurchaseReturn" ADD COLUMN IF NOT EXISTS "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "PurchaseReturn" ADD COLUMN IF NOT EXISTS "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'UNPOSTED';
ALTER TABLE "PurchaseReturn" ADD COLUMN IF NOT EXISTS "attachmentsCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "PurchaseReturn_branchId_idx" ON "PurchaseReturn"("branchId");

ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "attachmentsCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Employee_branchId_idx" ON "Employee"("branchId");

ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE';
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "attachmentsCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Contract_branchId_idx" ON "Contract"("branchId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovalWorkflow_branchId_fkey') THEN
    ALTER TABLE "ApprovalWorkflow" ADD CONSTRAINT "ApprovalWorkflow_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Document_branchId_fkey') THEN
    ALTER TABLE "Document" ADD CONSTRAINT "Document_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Document_uploadedById_fkey') THEN
    ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OutboxEvent_actorId_fkey') THEN
    ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OutboxEvent_branchId_fkey') THEN
    ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventConsumption_outboxEventId_fkey') THEN
    ALTER TABLE "EventConsumption" ADD CONSTRAINT "EventConsumption_outboxEventId_fkey" FOREIGN KEY ("outboxEventId") REFERENCES "OutboxEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_branchId_fkey') THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Customer_branchId_fkey') THEN
    ALTER TABLE "Customer" ADD CONSTRAINT "Customer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Supplier_branchId_fkey') THEN
    ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_branchId_fkey') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_branchId_fkey') THEN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FixedAsset_branchId_fkey') THEN
    ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Warehouse_branchId_fkey') THEN
    ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesQuote_branchId_fkey') THEN
    ALTER TABLE "SalesQuote" ADD CONSTRAINT "SalesQuote_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesReturn_branchId_fkey') THEN
    ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_branchId_fkey') THEN
    ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseReturn_branchId_fkey') THEN
    ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Employee_branchId_fkey') THEN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Contract_branchId_fkey') THEN
    ALTER TABLE "Contract" ADD CONSTRAINT "Contract_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
