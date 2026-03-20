-- AlterTable
ALTER TABLE "ApprovalWorkflow" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Attendance" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Branch" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ConversionJob" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ExportJob" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OutboxEvent" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PrintJob" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PrintTemplate" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProjectExpense" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SiteAttendance" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SiteDailyLog" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SiteIssue" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SiteMaterialRequest" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SitePhoto" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SiteProgress" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Subcontract" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SubcontractIpc" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Tender" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Timesheet" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "BudgetScenario" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "fiscalYear" INTEGER NOT NULL,
    "branchId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "controlLevel" "BudgetControlLevel" NOT NULL DEFAULT 'NONE',
    "notes" TEXT,
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "legacyBudgetId" INTEGER,
    "publishedVersionId" INTEGER,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetVersion" (
    "id" SERIAL NOT NULL,
    "scenarioId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "effectiveDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "plannedTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "committedTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "varianceTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "legacyBudgetId" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetAllocation" (
    "id" SERIAL NOT NULL,
    "allocationKey" TEXT NOT NULL,
    "scenarioId" INTEGER NOT NULL,
    "versionId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "accountId" INTEGER,
    "projectId" INTEGER,
    "costCenterId" INTEGER,
    "departmentId" INTEGER,
    "contractId" INTEGER,
    "legacyLineId" INTEGER,
    "period" INTEGER NOT NULL,
    "plannedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "committedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "varianceAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastSnapshot" (
    "id" SERIAL NOT NULL,
    "scenarioId" INTEGER,
    "versionId" INTEGER,
    "branchId" INTEGER,
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "label" TEXT NOT NULL,
    "plannedTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "forecastTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "varianceTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'SNAPSHOT',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForecastSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VarianceEntry" (
    "id" SERIAL NOT NULL,
    "varianceKey" TEXT NOT NULL,
    "scenarioId" INTEGER,
    "versionId" INTEGER,
    "allocationId" INTEGER,
    "branchId" INTEGER,
    "accountId" INTEGER,
    "projectId" INTEGER,
    "costCenterId" INTEGER,
    "departmentId" INTEGER,
    "contractId" INTEGER,
    "legacyLineId" INTEGER,
    "period" INTEGER NOT NULL,
    "plannedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "committedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "varianceAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "note" TEXT,
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VarianceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BudgetScenario_code_key" ON "BudgetScenario"("code");

-- CreateIndex
CREATE INDEX "BudgetScenario_branchId_fiscalYear_idx" ON "BudgetScenario"("branchId", "fiscalYear");

-- CreateIndex
CREATE INDEX "BudgetScenario_status_approvalStatus_idx" ON "BudgetScenario"("status", "approvalStatus");

-- CreateIndex
CREATE INDEX "BudgetVersion_status_approvalStatus_idx" ON "BudgetVersion"("status", "approvalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetVersion_scenarioId_label_key" ON "BudgetVersion"("scenarioId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetVersion_scenarioId_versionNumber_key" ON "BudgetVersion"("scenarioId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetAllocation_allocationKey_key" ON "BudgetAllocation"("allocationKey");

-- CreateIndex
CREATE INDEX "BudgetAllocation_versionId_period_idx" ON "BudgetAllocation"("versionId", "period");

-- CreateIndex
CREATE INDEX "BudgetAllocation_accountId_period_idx" ON "BudgetAllocation"("accountId", "period");

-- CreateIndex
CREATE INDEX "BudgetAllocation_branchId_projectId_idx" ON "BudgetAllocation"("branchId", "projectId");

-- CreateIndex
CREATE INDEX "ForecastSnapshot_scenarioId_snapshotDate_idx" ON "ForecastSnapshot"("scenarioId", "snapshotDate");

-- CreateIndex
CREATE INDEX "ForecastSnapshot_versionId_snapshotDate_idx" ON "ForecastSnapshot"("versionId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "VarianceEntry_varianceKey_key" ON "VarianceEntry"("varianceKey");

-- CreateIndex
CREATE INDEX "VarianceEntry_scenarioId_status_idx" ON "VarianceEntry"("scenarioId", "status");

-- CreateIndex
CREATE INDEX "VarianceEntry_versionId_severity_idx" ON "VarianceEntry"("versionId", "severity");

-- CreateIndex
CREATE INDEX "VarianceEntry_branchId_projectId_idx" ON "VarianceEntry"("branchId", "projectId");

-- CreateIndex
CREATE INDEX "Contract_branchId_status_idx" ON "Contract"("branchId", "status");

-- AddForeignKey
ALTER TABLE "BudgetVersion" ADD CONSTRAINT "BudgetVersion_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "BudgetScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "BudgetScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "BudgetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastSnapshot" ADD CONSTRAINT "ForecastSnapshot_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "BudgetScenario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastSnapshot" ADD CONSTRAINT "ForecastSnapshot_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "BudgetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianceEntry" ADD CONSTRAINT "VarianceEntry_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "BudgetScenario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianceEntry" ADD CONSTRAINT "VarianceEntry_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "BudgetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianceEntry" ADD CONSTRAINT "VarianceEntry_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "BudgetAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExpense" ADD CONSTRAINT "ProjectExpense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
