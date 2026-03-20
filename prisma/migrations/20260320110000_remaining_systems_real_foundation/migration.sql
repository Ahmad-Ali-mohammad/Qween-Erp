-- CreateTable
CREATE TABLE "QualityStandard" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "branchId" INTEGER,
    "projectId" INTEGER,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "checklist" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityStandard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" INTEGER,
    "projectId" INTEGER,
    "standardId" INTEGER,
    "inspectionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inspectorEmployeeId" INTEGER,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NcrReport" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" INTEGER,
    "projectId" INTEGER,
    "inspectionId" INTEGER,
    "reportDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "correctiveAction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "closedById" INTEGER,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NcrReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermitToWork" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" INTEGER,
    "projectId" INTEGER,
    "permitType" TEXT NOT NULL DEFAULT 'GENERAL',
    "title" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "issuerEmployeeId" INTEGER,
    "approverEmployeeId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermitToWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyIncident" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" INTEGER,
    "projectId" INTEGER,
    "permitId" INTEGER,
    "incidentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "rootCause" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" INTEGER,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenancePlan" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "branchId" INTEGER,
    "assetId" INTEGER,
    "projectId" INTEGER,
    "title" TEXT NOT NULL,
    "frequencyType" TEXT NOT NULL DEFAULT 'TIME',
    "intervalValue" INTEGER NOT NULL DEFAULT 1,
    "nextDueDate" TIMESTAMP(3),
    "nextDueHours" DECIMAL(65,30),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceOrder" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" INTEGER,
    "planId" INTEGER,
    "assetId" INTEGER,
    "projectId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "scheduledDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "estimatedCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceExecution" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER,
    "orderId" INTEGER NOT NULL,
    "assetId" INTEGER,
    "projectId" INTEGER,
    "executionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "technicianEmployeeId" INTEGER,
    "hoursWorked" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "laborCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "spareItemId" INTEGER,
    "warehouseId" INTEGER,
    "spareQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "spareCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'LOGGED',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpareReservation" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER,
    "orderId" INTEGER,
    "assetId" INTEGER,
    "itemId" INTEGER NOT NULL,
    "warehouseId" INTEGER,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpareReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FailureAnalysis" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" INTEGER,
    "orderId" INTEGER,
    "assetId" INTEGER,
    "projectId" INTEGER,
    "incidentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "failureMode" TEXT NOT NULL,
    "rootCause" TEXT,
    "mtbfHours" DECIMAL(65,30),
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "repeatCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FailureAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskRegister" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "branchId" INTEGER,
    "projectId" INTEGER,
    "contractId" INTEGER,
    "departmentId" INTEGER,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerEmployeeId" INTEGER,
    "probability" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "impact" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "exposure" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" SERIAL NOT NULL,
    "riskId" INTEGER NOT NULL,
    "assessmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "probability" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "impact" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "exposure" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "notes" TEXT,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MitigationPlan" (
    "id" SERIAL NOT NULL,
    "riskId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerEmployeeId" INTEGER,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MitigationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskFollowup" (
    "id" SERIAL NOT NULL,
    "riskId" INTEGER NOT NULL,
    "followupDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "nextAction" TEXT,
    "nextReviewDate" TIMESTAMP(3),
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskFollowup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulePlan" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "branchId" INTEGER,
    "projectId" INTEGER,
    "title" TEXT NOT NULL,
    "baselineStart" TIMESTAMP(3),
    "baselineEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleTask" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "projectId" INTEGER,
    "title" TEXT NOT NULL,
    "wbsCode" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "progressPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "durationDays" INTEGER NOT NULL DEFAULT 0,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "predecessorTaskId" INTEGER NOT NULL,
    "successorTaskId" INTEGER NOT NULL,
    "dependencyType" TEXT NOT NULL DEFAULT 'FS',
    "lagDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriticalPathSnapshot" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "criticalTasksCount" INTEGER NOT NULL DEFAULT 0,
    "delayedTasksCount" INTEGER NOT NULL DEFAULT 0,
    "totalTasksCount" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'SNAPSHOT',
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CriticalPathSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceAssignment" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "taskId" INTEGER,
    "resourceType" TEXT NOT NULL,
    "resourceRefId" INTEGER NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "allocationPercent" DECIMAL(65,30) NOT NULL DEFAULT 100,
    "status" TEXT NOT NULL DEFAULT 'ALLOCATED',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QualityStandard_code_key" ON "QualityStandard"("code");

-- CreateIndex
CREATE INDEX "QualityStandard_branchId_status_idx" ON "QualityStandard"("branchId", "status");

-- CreateIndex
CREATE INDEX "QualityStandard_projectId_status_idx" ON "QualityStandard"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_number_key" ON "Inspection"("number");

-- CreateIndex
CREATE INDEX "Inspection_branchId_status_approvalStatus_idx" ON "Inspection"("branchId", "status", "approvalStatus");

-- CreateIndex
CREATE INDEX "Inspection_projectId_inspectionDate_idx" ON "Inspection"("projectId", "inspectionDate");

-- CreateIndex
CREATE INDEX "Inspection_standardId_idx" ON "Inspection"("standardId");

-- CreateIndex
CREATE UNIQUE INDEX "NcrReport_number_key" ON "NcrReport"("number");

-- CreateIndex
CREATE INDEX "NcrReport_branchId_status_severity_idx" ON "NcrReport"("branchId", "status", "severity");

-- CreateIndex
CREATE INDEX "NcrReport_projectId_reportDate_idx" ON "NcrReport"("projectId", "reportDate");

-- CreateIndex
CREATE INDEX "NcrReport_inspectionId_idx" ON "NcrReport"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "PermitToWork_number_key" ON "PermitToWork"("number");

-- CreateIndex
CREATE INDEX "PermitToWork_branchId_status_approvalStatus_idx" ON "PermitToWork"("branchId", "status", "approvalStatus");

-- CreateIndex
CREATE INDEX "PermitToWork_projectId_validTo_idx" ON "PermitToWork"("projectId", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyIncident_number_key" ON "SafetyIncident"("number");

-- CreateIndex
CREATE INDEX "SafetyIncident_branchId_status_severity_idx" ON "SafetyIncident"("branchId", "status", "severity");

-- CreateIndex
CREATE INDEX "SafetyIncident_projectId_incidentDate_idx" ON "SafetyIncident"("projectId", "incidentDate");

-- CreateIndex
CREATE INDEX "SafetyIncident_permitId_idx" ON "SafetyIncident"("permitId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenancePlan_code_key" ON "MaintenancePlan"("code");

-- CreateIndex
CREATE INDEX "MaintenancePlan_branchId_status_idx" ON "MaintenancePlan"("branchId", "status");

-- CreateIndex
CREATE INDEX "MaintenancePlan_assetId_status_idx" ON "MaintenancePlan"("assetId", "status");

-- CreateIndex
CREATE INDEX "MaintenancePlan_projectId_status_idx" ON "MaintenancePlan"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceOrder_number_key" ON "MaintenanceOrder"("number");

-- CreateIndex
CREATE INDEX "MaintenanceOrder_branchId_status_approvalStatus_idx" ON "MaintenanceOrder"("branchId", "status", "approvalStatus");

-- CreateIndex
CREATE INDEX "MaintenanceOrder_assetId_dueDate_idx" ON "MaintenanceOrder"("assetId", "dueDate");

-- CreateIndex
CREATE INDEX "MaintenanceOrder_projectId_dueDate_idx" ON "MaintenanceOrder"("projectId", "dueDate");

-- CreateIndex
CREATE INDEX "MaintenanceOrder_planId_idx" ON "MaintenanceOrder"("planId");

-- CreateIndex
CREATE INDEX "MaintenanceExecution_branchId_executionDate_idx" ON "MaintenanceExecution"("branchId", "executionDate");

-- CreateIndex
CREATE INDEX "MaintenanceExecution_orderId_executionDate_idx" ON "MaintenanceExecution"("orderId", "executionDate");

-- CreateIndex
CREATE INDEX "MaintenanceExecution_assetId_executionDate_idx" ON "MaintenanceExecution"("assetId", "executionDate");

-- CreateIndex
CREATE INDEX "SpareReservation_branchId_status_idx" ON "SpareReservation"("branchId", "status");

-- CreateIndex
CREATE INDEX "SpareReservation_orderId_idx" ON "SpareReservation"("orderId");

-- CreateIndex
CREATE INDEX "SpareReservation_itemId_warehouseId_idx" ON "SpareReservation"("itemId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "FailureAnalysis_number_key" ON "FailureAnalysis"("number");

-- CreateIndex
CREATE INDEX "FailureAnalysis_branchId_status_severity_idx" ON "FailureAnalysis"("branchId", "status", "severity");

-- CreateIndex
CREATE INDEX "FailureAnalysis_assetId_incidentDate_idx" ON "FailureAnalysis"("assetId", "incidentDate");

-- CreateIndex
CREATE INDEX "FailureAnalysis_orderId_idx" ON "FailureAnalysis"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskRegister_code_key" ON "RiskRegister"("code");

-- CreateIndex
CREATE INDEX "RiskRegister_branchId_status_severity_idx" ON "RiskRegister"("branchId", "status", "severity");

-- CreateIndex
CREATE INDEX "RiskRegister_projectId_status_idx" ON "RiskRegister"("projectId", "status");

-- CreateIndex
CREATE INDEX "RiskRegister_contractId_status_idx" ON "RiskRegister"("contractId", "status");

-- CreateIndex
CREATE INDEX "RiskAssessment_riskId_assessmentDate_idx" ON "RiskAssessment"("riskId", "assessmentDate");

-- CreateIndex
CREATE INDEX "MitigationPlan_riskId_status_idx" ON "MitigationPlan"("riskId", "status");

-- CreateIndex
CREATE INDEX "MitigationPlan_dueDate_status_idx" ON "MitigationPlan"("dueDate", "status");

-- CreateIndex
CREATE INDEX "RiskFollowup_riskId_followupDate_idx" ON "RiskFollowup"("riskId", "followupDate");

-- CreateIndex
CREATE INDEX "RiskFollowup_nextReviewDate_status_idx" ON "RiskFollowup"("nextReviewDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SchedulePlan_code_key" ON "SchedulePlan"("code");

-- CreateIndex
CREATE INDEX "SchedulePlan_branchId_status_idx" ON "SchedulePlan"("branchId", "status");

-- CreateIndex
CREATE INDEX "SchedulePlan_projectId_status_idx" ON "SchedulePlan"("projectId", "status");

-- CreateIndex
CREATE INDEX "ScheduleTask_planId_startDate_idx" ON "ScheduleTask"("planId", "startDate");

-- CreateIndex
CREATE INDEX "ScheduleTask_projectId_endDate_idx" ON "ScheduleTask"("projectId", "endDate");

-- CreateIndex
CREATE INDEX "TaskDependency_planId_idx" ON "TaskDependency"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_planId_predecessorTaskId_successorTaskId_dep_key" ON "TaskDependency"("planId", "predecessorTaskId", "successorTaskId", "dependencyType");

-- CreateIndex
CREATE INDEX "CriticalPathSnapshot_planId_snapshotDate_idx" ON "CriticalPathSnapshot"("planId", "snapshotDate");

-- CreateIndex
CREATE INDEX "ResourceAssignment_planId_resourceType_idx" ON "ResourceAssignment"("planId", "resourceType");

-- CreateIndex
CREATE INDEX "ResourceAssignment_taskId_idx" ON "ResourceAssignment"("taskId");

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_standardId_fkey" FOREIGN KEY ("standardId") REFERENCES "QualityStandard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NcrReport" ADD CONSTRAINT "NcrReport_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "PermitToWork"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceOrder" ADD CONSTRAINT "MaintenanceOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MaintenancePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceExecution" ADD CONSTRAINT "MaintenanceExecution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MaintenanceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpareReservation" ADD CONSTRAINT "SpareReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MaintenanceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FailureAnalysis" ADD CONSTRAINT "FailureAnalysis_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MaintenanceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "RiskRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MitigationPlan" ADD CONSTRAINT "MitigationPlan_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "RiskRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskFollowup" ADD CONSTRAINT "RiskFollowup_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "RiskRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTask" ADD CONSTRAINT "ScheduleTask_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SchedulePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SchedulePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_predecessorTaskId_fkey" FOREIGN KEY ("predecessorTaskId") REFERENCES "ScheduleTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_successorTaskId_fkey" FOREIGN KEY ("successorTaskId") REFERENCES "ScheduleTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriticalPathSnapshot" ADD CONSTRAINT "CriticalPathSnapshot_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SchedulePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SchedulePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ScheduleTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

