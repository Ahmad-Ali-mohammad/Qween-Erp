-- CreateTable
CREATE TABLE "EquipmentAllocation" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "projectId" INTEGER,
    "branchId" INTEGER,
    "projectExpenseId" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "dailyRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "hourlyRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "hoursUsed" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "fuelCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "chargeAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "operatorId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceLog" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "projectId" INTEGER,
    "branchId" INTEGER,
    "supplierId" INTEGER,
    "projectExpenseId" INTEGER,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "cost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "description" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipmentAllocation_assetId_status_idx" ON "EquipmentAllocation"("assetId", "status");

-- CreateIndex
CREATE INDEX "EquipmentAllocation_projectId_status_idx" ON "EquipmentAllocation"("projectId", "status");

-- CreateIndex
CREATE INDEX "EquipmentAllocation_branchId_startDate_idx" ON "EquipmentAllocation"("branchId", "startDate");

-- CreateIndex
CREATE INDEX "MaintenanceLog_assetId_status_idx" ON "MaintenanceLog"("assetId", "status");

-- CreateIndex
CREATE INDEX "MaintenanceLog_projectId_status_idx" ON "MaintenanceLog"("projectId", "status");

-- CreateIndex
CREATE INDEX "MaintenanceLog_branchId_serviceDate_idx" ON "MaintenanceLog"("branchId", "serviceDate");

-- AddForeignKey
ALTER TABLE "EquipmentAllocation" ADD CONSTRAINT "EquipmentAllocation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAllocation" ADD CONSTRAINT "EquipmentAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAllocation" ADD CONSTRAINT "EquipmentAllocation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAllocation" ADD CONSTRAINT "EquipmentAllocation_projectExpenseId_fkey" FOREIGN KEY ("projectExpenseId") REFERENCES "ProjectExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_projectExpenseId_fkey" FOREIGN KEY ("projectExpenseId") REFERENCES "ProjectExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

