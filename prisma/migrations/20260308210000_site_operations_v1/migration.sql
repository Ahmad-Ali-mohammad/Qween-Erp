CREATE TABLE "SiteDailyLog" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER,
    "siteId" INTEGER,
    "projectId" INTEGER NOT NULL,
    "logDate" TIMESTAMP(3) NOT NULL,
    "weather" TEXT,
    "manpowerCount" INTEGER NOT NULL DEFAULT 0,
    "equipmentCount" INTEGER NOT NULL DEFAULT 0,
    "progressSummary" TEXT,
    "issues" TEXT,
    "notes" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteDailyLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SiteMaterialRequest" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" INTEGER,
    "siteId" INTEGER,
    "projectId" INTEGER NOT NULL,
    "warehouseId" INTEGER,
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "neededBy" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "requestedById" INTEGER,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteMaterialRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SiteMaterialRequestLine" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "issuedQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "estimatedUnitCost" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteMaterialRequestLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SiteProgressEntry" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER,
    "siteId" INTEGER,
    "projectId" INTEGER NOT NULL,
    "phaseId" INTEGER,
    "taskId" INTEGER,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "progressPercent" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "quantityCompleted" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "description" TEXT,
    "notes" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteProgressEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SiteEquipmentIssue" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER,
    "siteId" INTEGER,
    "projectId" INTEGER,
    "assetId" INTEGER NOT NULL,
    "maintenanceLogId" INTEGER,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "resolutionNotes" TEXT,
    "reportedById" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteEquipmentIssue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteMaterialRequest_number_key" ON "SiteMaterialRequest"("number");

CREATE INDEX "SiteDailyLog_projectId_logDate_idx" ON "SiteDailyLog"("projectId", "logDate");
CREATE INDEX "SiteDailyLog_branchId_logDate_idx" ON "SiteDailyLog"("branchId", "logDate");
CREATE INDEX "SiteDailyLog_siteId_logDate_idx" ON "SiteDailyLog"("siteId", "logDate");

CREATE INDEX "SiteMaterialRequest_projectId_requestDate_idx" ON "SiteMaterialRequest"("projectId", "requestDate");
CREATE INDEX "SiteMaterialRequest_branchId_requestDate_idx" ON "SiteMaterialRequest"("branchId", "requestDate");
CREATE INDEX "SiteMaterialRequest_siteId_requestDate_idx" ON "SiteMaterialRequest"("siteId", "requestDate");
CREATE INDEX "SiteMaterialRequest_warehouseId_status_idx" ON "SiteMaterialRequest"("warehouseId", "status");

CREATE INDEX "SiteMaterialRequestLine_requestId_idx" ON "SiteMaterialRequestLine"("requestId");
CREATE INDEX "SiteMaterialRequestLine_itemId_idx" ON "SiteMaterialRequestLine"("itemId");

CREATE INDEX "SiteProgressEntry_projectId_entryDate_idx" ON "SiteProgressEntry"("projectId", "entryDate");
CREATE INDEX "SiteProgressEntry_phaseId_entryDate_idx" ON "SiteProgressEntry"("phaseId", "entryDate");
CREATE INDEX "SiteProgressEntry_taskId_entryDate_idx" ON "SiteProgressEntry"("taskId", "entryDate");
CREATE INDEX "SiteProgressEntry_branchId_entryDate_idx" ON "SiteProgressEntry"("branchId", "entryDate");

CREATE INDEX "SiteEquipmentIssue_assetId_issueDate_idx" ON "SiteEquipmentIssue"("assetId", "issueDate");
CREATE INDEX "SiteEquipmentIssue_projectId_issueDate_idx" ON "SiteEquipmentIssue"("projectId", "issueDate");
CREATE INDEX "SiteEquipmentIssue_branchId_issueDate_idx" ON "SiteEquipmentIssue"("branchId", "issueDate");
CREATE INDEX "SiteEquipmentIssue_status_issueDate_idx" ON "SiteEquipmentIssue"("status", "issueDate");

ALTER TABLE "SiteDailyLog"
    ADD CONSTRAINT "SiteDailyLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SiteDailyLog"
    ADD CONSTRAINT "SiteDailyLog_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SiteDailyLog"
    ADD CONSTRAINT "SiteDailyLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SiteMaterialRequest"
    ADD CONSTRAINT "SiteMaterialRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SiteMaterialRequest"
    ADD CONSTRAINT "SiteMaterialRequest_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SiteMaterialRequest"
    ADD CONSTRAINT "SiteMaterialRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteMaterialRequest"
    ADD CONSTRAINT "SiteMaterialRequest_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SiteMaterialRequestLine"
    ADD CONSTRAINT "SiteMaterialRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SiteMaterialRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteMaterialRequestLine"
    ADD CONSTRAINT "SiteMaterialRequestLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SiteProgressEntry"
    ADD CONSTRAINT "SiteProgressEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SiteProgressEntry"
    ADD CONSTRAINT "SiteProgressEntry_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SiteProgressEntry"
    ADD CONSTRAINT "SiteProgressEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteProgressEntry"
    ADD CONSTRAINT "SiteProgressEntry_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProjectPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SiteProgressEntry"
    ADD CONSTRAINT "SiteProgressEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SiteEquipmentIssue"
    ADD CONSTRAINT "SiteEquipmentIssue_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SiteEquipmentIssue"
    ADD CONSTRAINT "SiteEquipmentIssue_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SiteEquipmentIssue"
    ADD CONSTRAINT "SiteEquipmentIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SiteEquipmentIssue"
    ADD CONSTRAINT "SiteEquipmentIssue_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteEquipmentIssue"
    ADD CONSTRAINT "SiteEquipmentIssue_maintenanceLogId_fkey" FOREIGN KEY ("maintenanceLogId") REFERENCES "MaintenanceLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
