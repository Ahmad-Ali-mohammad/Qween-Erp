CREATE TABLE "MaintenanceSchedule" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "projectId" INTEGER,
    "supplierId" INTEGER,
    "title" TEXT,
    "frequencyUnit" TEXT NOT NULL DEFAULT 'MONTH',
    "frequencyValue" INTEGER NOT NULL DEFAULT 1,
    "startDate" TIMESTAMP(3),
    "nextDueDate" TIMESTAMP(3),
    "lastExecutedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaintenanceWorkOrder" (
    "id" SERIAL NOT NULL,
    "scheduleId" INTEGER,
    "assetId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "projectId" INTEGER,
    "supplierId" INTEGER,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cost" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "description" TEXT,
    "notes" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceWorkOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaintenanceSparePart" (
    "id" SERIAL NOT NULL,
    "workOrderId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "warehouseId" INTEGER,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "reservedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "issuedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceSparePart_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MaintenanceSchedule_assetId_status_idx" ON "MaintenanceSchedule"("assetId", "status");
CREATE INDEX "MaintenanceSchedule_branchId_nextDueDate_idx" ON "MaintenanceSchedule"("branchId", "nextDueDate");
CREATE INDEX "MaintenanceSchedule_projectId_nextDueDate_idx" ON "MaintenanceSchedule"("projectId", "nextDueDate");

CREATE INDEX "MaintenanceWorkOrder_assetId_status_idx" ON "MaintenanceWorkOrder"("assetId", "status");
CREATE INDEX "MaintenanceWorkOrder_branchId_requestedAt_idx" ON "MaintenanceWorkOrder"("branchId", "requestedAt");
CREATE INDEX "MaintenanceWorkOrder_projectId_requestedAt_idx" ON "MaintenanceWorkOrder"("projectId", "requestedAt");
CREATE INDEX "MaintenanceWorkOrder_scheduleId_idx" ON "MaintenanceWorkOrder"("scheduleId");

CREATE INDEX "MaintenanceSparePart_workOrderId_idx" ON "MaintenanceSparePart"("workOrderId");
CREATE INDEX "MaintenanceSparePart_itemId_idx" ON "MaintenanceSparePart"("itemId");

ALTER TABLE "MaintenanceSchedule"
    ADD CONSTRAINT "MaintenanceSchedule_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaintenanceSchedule"
    ADD CONSTRAINT "MaintenanceSchedule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MaintenanceSchedule"
    ADD CONSTRAINT "MaintenanceSchedule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MaintenanceSchedule"
    ADD CONSTRAINT "MaintenanceSchedule_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MaintenanceWorkOrder"
    ADD CONSTRAINT "MaintenanceWorkOrder_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "MaintenanceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MaintenanceWorkOrder"
    ADD CONSTRAINT "MaintenanceWorkOrder_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaintenanceWorkOrder"
    ADD CONSTRAINT "MaintenanceWorkOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MaintenanceWorkOrder"
    ADD CONSTRAINT "MaintenanceWorkOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MaintenanceWorkOrder"
    ADD CONSTRAINT "MaintenanceWorkOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MaintenanceSparePart"
    ADD CONSTRAINT "MaintenanceSparePart_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "MaintenanceWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaintenanceSparePart"
    ADD CONSTRAINT "MaintenanceSparePart_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MaintenanceSparePart"
    ADD CONSTRAINT "MaintenanceSparePart_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
