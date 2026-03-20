CREATE TABLE IF NOT EXISTS "SiteDailyLog" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" INTEGER,
    "projectId" INTEGER NOT NULL,
    "logDate" TIMESTAMP(3) NOT NULL,
    "weather" TEXT,
    "workforceCount" INTEGER NOT NULL DEFAULT 0,
    "equipmentSummary" TEXT,
    "workExecuted" TEXT,
    "blockers" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "postingStatus" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteDailyLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SiteDailyLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SiteDailyLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SiteMaterialRequest" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" INTEGER,
    "projectId" INTEGER NOT NULL,
    "dailyLogId" INTEGER,
    "itemId" INTEGER,
    "warehouseId" INTEGER,
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requiredBy" TIMESTAMP(3),
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "issuedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "purpose" TEXT,
    "sourceMode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "postingStatus" TEXT NOT NULL DEFAULT 'UNPOSTED',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteMaterialRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SiteMaterialRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SiteMaterialRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SiteMaterialRequest_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "SiteDailyLog"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SiteMaterialRequest_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SiteMaterialRequest_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SiteProgress" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER,
    "projectId" INTEGER NOT NULL,
    "dailyLogId" INTEGER,
    "reportDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wbsCode" TEXT,
    "taskName" TEXT NOT NULL,
    "plannedPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "executedQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "postingStatus" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteProgress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SiteProgress_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SiteProgress_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SiteProgress_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "SiteDailyLog"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SiteIssue" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" INTEGER,
    "projectId" INTEGER NOT NULL,
    "dailyLogId" INTEGER,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "postingStatus" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "reportedByEmployeeId" INTEGER,
    "resolvedByEmployeeId" INTEGER,
    "dueDate" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteIssue_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SiteIssue_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SiteIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SiteIssue_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "SiteDailyLog"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SitePhoto" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER,
    "projectId" INTEGER NOT NULL,
    "dailyLogId" INTEGER,
    "issueId" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "caption" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "postingStatus" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 1,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SitePhoto_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SitePhoto_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SitePhoto_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SitePhoto_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "SiteDailyLog"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SitePhoto_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "SiteIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SiteAttendance" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER,
    "projectId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "hoursWorked" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "shift" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "source" TEXT NOT NULL DEFAULT 'SITE',
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "postingStatus" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteAttendance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SiteAttendance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SiteAttendance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SiteAttendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "SiteDailyLog" ADD COLUMN IF NOT EXISTS "number" TEXT;
ALTER TABLE "SiteDailyLog" ADD COLUMN IF NOT EXISTS "workforceCount" INTEGER;
ALTER TABLE "SiteDailyLog" ADD COLUMN IF NOT EXISTS "equipmentSummary" TEXT;
ALTER TABLE "SiteDailyLog" ADD COLUMN IF NOT EXISTS "workExecuted" TEXT;
ALTER TABLE "SiteDailyLog" ADD COLUMN IF NOT EXISTS "blockers" TEXT;
ALTER TABLE "SiteDailyLog" ADD COLUMN IF NOT EXISTS "status" TEXT;
ALTER TABLE "SiteDailyLog" ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT;
ALTER TABLE "SiteDailyLog" ADD COLUMN IF NOT EXISTS "postingStatus" TEXT;
ALTER TABLE "SiteDailyLog" ADD COLUMN IF NOT EXISTS "attachmentsCount" INTEGER;
ALTER TABLE "SiteDailyLog" ADD COLUMN IF NOT EXISTS "updatedById" INTEGER;
ALTER TABLE "SiteDailyLog" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "SiteDailyLog" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'SiteDailyLog' AND column_name = 'manpowerCount'
  ) THEN
    EXECUTE 'UPDATE "SiteDailyLog" SET "workforceCount" = COALESCE("workforceCount", "manpowerCount", 0)';
  ELSE
    EXECUTE 'UPDATE "SiteDailyLog" SET "workforceCount" = COALESCE("workforceCount", 0)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'SiteDailyLog' AND column_name = 'progressSummary'
  ) THEN
    EXECUTE 'UPDATE "SiteDailyLog" SET "equipmentSummary" = COALESCE("equipmentSummary", "progressSummary")';
  END IF;
END $$;

UPDATE "SiteDailyLog"
SET
  "number" = COALESCE(NULLIF("number", ''), 'SDL-LEGACY-' || "id"),
  "status" = COALESCE("status", 'DRAFT'),
  "approvalStatus" = COALESCE("approvalStatus", 'DRAFT'),
  "postingStatus" = COALESCE("postingStatus", 'NOT_APPLICABLE'),
  "attachmentsCount" = COALESCE("attachmentsCount", 0);

ALTER TABLE "SiteDailyLog" ALTER COLUMN "number" SET NOT NULL;
ALTER TABLE "SiteDailyLog" ALTER COLUMN "workforceCount" SET DEFAULT 0;
ALTER TABLE "SiteDailyLog" ALTER COLUMN "workforceCount" SET NOT NULL;
ALTER TABLE "SiteDailyLog" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "SiteDailyLog" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "SiteDailyLog" ALTER COLUMN "approvalStatus" SET DEFAULT 'DRAFT';
ALTER TABLE "SiteDailyLog" ALTER COLUMN "approvalStatus" SET NOT NULL;
ALTER TABLE "SiteDailyLog" ALTER COLUMN "postingStatus" SET DEFAULT 'NOT_APPLICABLE';
ALTER TABLE "SiteDailyLog" ALTER COLUMN "postingStatus" SET NOT NULL;
ALTER TABLE "SiteDailyLog" ALTER COLUMN "attachmentsCount" SET DEFAULT 0;
ALTER TABLE "SiteDailyLog" ALTER COLUMN "attachmentsCount" SET NOT NULL;

ALTER TABLE "SiteMaterialRequest" ADD COLUMN IF NOT EXISTS "dailyLogId" INTEGER;
ALTER TABLE "SiteMaterialRequest" ADD COLUMN IF NOT EXISTS "number" TEXT;
ALTER TABLE "SiteMaterialRequest" ADD COLUMN IF NOT EXISTS "itemId" INTEGER;
ALTER TABLE "SiteMaterialRequest" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(65,30);
ALTER TABLE "SiteMaterialRequest" ADD COLUMN IF NOT EXISTS "issuedQuantity" DECIMAL(65,30);
ALTER TABLE "SiteMaterialRequest" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "SiteMaterialRequest" ADD COLUMN IF NOT EXISTS "purpose" TEXT;
ALTER TABLE "SiteMaterialRequest" ADD COLUMN IF NOT EXISTS "sourceMode" TEXT;
ALTER TABLE "SiteMaterialRequest" ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT;
ALTER TABLE "SiteMaterialRequest" ADD COLUMN IF NOT EXISTS "postingStatus" TEXT;
ALTER TABLE "SiteMaterialRequest" ADD COLUMN IF NOT EXISTS "attachmentsCount" INTEGER;
ALTER TABLE "SiteMaterialRequest" ADD COLUMN IF NOT EXISTS "createdById" INTEGER;
ALTER TABLE "SiteMaterialRequest" ADD COLUMN IF NOT EXISTS "updatedById" INTEGER;
ALTER TABLE "SiteMaterialRequest" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "SiteMaterialRequest" ADD COLUMN IF NOT EXISTS "requiredBy" TIMESTAMP(3);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'SiteMaterialRequest' AND column_name = 'neededBy'
  ) THEN
    EXECUTE 'UPDATE "SiteMaterialRequest" SET "requiredBy" = COALESCE("requiredBy", "neededBy")';
  END IF;
END $$;

UPDATE "SiteMaterialRequest"
SET
  "number" = COALESCE(NULLIF("number", ''), 'SMR-LEGACY-' || "id"),
  "quantity" = COALESCE("quantity", 0),
  "issuedQuantity" = COALESCE("issuedQuantity", 0),
  "approvalStatus" = COALESCE("approvalStatus", CASE WHEN "status" IN ('SUBMITTED', 'UNDER_REVIEW') THEN 'PENDING' WHEN "status" IN ('APPROVED', 'FULFILLED') THEN 'APPROVED' ELSE 'DRAFT' END),
  "postingStatus" = COALESCE("postingStatus", CASE WHEN "status" = 'FULFILLED' THEN 'POSTED' ELSE 'UNPOSTED' END),
  "attachmentsCount" = COALESCE("attachmentsCount", 0);

ALTER TABLE "SiteMaterialRequest" ALTER COLUMN "number" SET NOT NULL;
ALTER TABLE "SiteMaterialRequest" ALTER COLUMN "quantity" SET DEFAULT 0;
ALTER TABLE "SiteMaterialRequest" ALTER COLUMN "quantity" SET NOT NULL;
ALTER TABLE "SiteMaterialRequest" ALTER COLUMN "issuedQuantity" SET DEFAULT 0;
ALTER TABLE "SiteMaterialRequest" ALTER COLUMN "issuedQuantity" SET NOT NULL;
ALTER TABLE "SiteMaterialRequest" ALTER COLUMN "approvalStatus" SET DEFAULT 'DRAFT';
ALTER TABLE "SiteMaterialRequest" ALTER COLUMN "approvalStatus" SET NOT NULL;
ALTER TABLE "SiteMaterialRequest" ALTER COLUMN "postingStatus" SET DEFAULT 'UNPOSTED';
ALTER TABLE "SiteMaterialRequest" ALTER COLUMN "postingStatus" SET NOT NULL;
ALTER TABLE "SiteMaterialRequest" ALTER COLUMN "attachmentsCount" SET DEFAULT 0;
ALTER TABLE "SiteMaterialRequest" ALTER COLUMN "attachmentsCount" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SiteDailyLog_branchId_fkey') THEN
    ALTER TABLE "SiteDailyLog"
    ADD CONSTRAINT "SiteDailyLog_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SiteDailyLog_projectId_fkey') THEN
    ALTER TABLE "SiteDailyLog"
    ADD CONSTRAINT "SiteDailyLog_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SiteMaterialRequest_branchId_fkey') THEN
    ALTER TABLE "SiteMaterialRequest"
    ADD CONSTRAINT "SiteMaterialRequest_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SiteMaterialRequest_projectId_fkey') THEN
    ALTER TABLE "SiteMaterialRequest"
    ADD CONSTRAINT "SiteMaterialRequest_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SiteMaterialRequest_dailyLogId_fkey') THEN
    ALTER TABLE "SiteMaterialRequest"
    ADD CONSTRAINT "SiteMaterialRequest_dailyLogId_fkey"
    FOREIGN KEY ("dailyLogId") REFERENCES "SiteDailyLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SiteMaterialRequest_itemId_fkey') THEN
    ALTER TABLE "SiteMaterialRequest"
    ADD CONSTRAINT "SiteMaterialRequest_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SiteMaterialRequest_warehouseId_fkey') THEN
    ALTER TABLE "SiteMaterialRequest"
    ADD CONSTRAINT "SiteMaterialRequest_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'SiteDailyLog' AND column_name = 'number'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "SiteDailyLog_number_key" ON "SiteDailyLog"("number")';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SiteDailyLog_branchId_logDate_idx" ON "SiteDailyLog"("branchId", "logDate");
CREATE INDEX IF NOT EXISTS "SiteDailyLog_projectId_logDate_idx" ON "SiteDailyLog"("projectId", "logDate");
CREATE INDEX IF NOT EXISTS "SiteDailyLog_status_approvalStatus_idx" ON "SiteDailyLog"("status", "approvalStatus");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'SiteMaterialRequest' AND column_name = 'number'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "SiteMaterialRequest_number_key" ON "SiteMaterialRequest"("number")';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SiteMaterialRequest_branchId_requestDate_idx" ON "SiteMaterialRequest"("branchId", "requestDate");
CREATE INDEX IF NOT EXISTS "SiteMaterialRequest_projectId_status_idx" ON "SiteMaterialRequest"("projectId", "status");
CREATE INDEX IF NOT EXISTS "SiteMaterialRequest_itemId_warehouseId_idx" ON "SiteMaterialRequest"("itemId", "warehouseId");

CREATE INDEX IF NOT EXISTS "SiteProgress_branchId_reportDate_idx" ON "SiteProgress"("branchId", "reportDate");
CREATE INDEX IF NOT EXISTS "SiteProgress_projectId_reportDate_idx" ON "SiteProgress"("projectId", "reportDate");

CREATE UNIQUE INDEX IF NOT EXISTS "SiteIssue_number_key" ON "SiteIssue"("number");
CREATE INDEX IF NOT EXISTS "SiteIssue_branchId_status_severity_idx" ON "SiteIssue"("branchId", "status", "severity");
CREATE INDEX IF NOT EXISTS "SiteIssue_projectId_issueDate_idx" ON "SiteIssue"("projectId", "issueDate");

CREATE INDEX IF NOT EXISTS "SitePhoto_projectId_capturedAt_idx" ON "SitePhoto"("projectId", "capturedAt");
CREATE INDEX IF NOT EXISTS "SitePhoto_issueId_idx" ON "SitePhoto"("issueId");

CREATE UNIQUE INDEX IF NOT EXISTS "SiteAttendance_employeeId_projectId_date_key" ON "SiteAttendance"("employeeId", "projectId", "date");
CREATE INDEX IF NOT EXISTS "SiteAttendance_branchId_date_idx" ON "SiteAttendance"("branchId", "date");
CREATE INDEX IF NOT EXISTS "SiteAttendance_projectId_date_idx" ON "SiteAttendance"("projectId", "date");
