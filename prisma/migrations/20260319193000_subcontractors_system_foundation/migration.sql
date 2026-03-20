CREATE TABLE "Subcontract" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" INTEGER,
    "supplierId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "scope" TEXT,
    "workOrderNumber" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "contractValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "certifiedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "retentionHeld" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "retentionRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "performanceRating" INTEGER,
    "notes" TEXT,
    "activatedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subcontract_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubcontractIpc" (
    "id" SERIAL NOT NULL,
    "subcontractId" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "certificateDate" TIMESTAMP(3) NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "claimedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "previousCertifiedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "certifiedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "retentionRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "retentionAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'UNPOSTED',
    "payableInvoiceId" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubcontractIpc_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subcontract_number_key" ON "Subcontract"("number");
CREATE INDEX "Subcontract_branchId_idx" ON "Subcontract"("branchId");
CREATE INDEX "Subcontract_supplierId_idx" ON "Subcontract"("supplierId");
CREATE INDEX "Subcontract_projectId_idx" ON "Subcontract"("projectId");
CREATE INDEX "Subcontract_status_idx" ON "Subcontract"("status");

CREATE UNIQUE INDEX "SubcontractIpc_number_key" ON "SubcontractIpc"("number");
CREATE INDEX "SubcontractIpc_subcontractId_idx" ON "SubcontractIpc"("subcontractId");
CREATE INDEX "SubcontractIpc_status_idx" ON "SubcontractIpc"("status");
CREATE INDEX "SubcontractIpc_approvalStatus_idx" ON "SubcontractIpc"("approvalStatus");
CREATE INDEX "SubcontractIpc_payableInvoiceId_idx" ON "SubcontractIpc"("payableInvoiceId");

ALTER TABLE "Subcontract"
ADD CONSTRAINT "Subcontract_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Subcontract"
ADD CONSTRAINT "Subcontract_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Subcontract"
ADD CONSTRAINT "Subcontract_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubcontractIpc"
ADD CONSTRAINT "SubcontractIpc_subcontractId_fkey"
FOREIGN KEY ("subcontractId") REFERENCES "Subcontract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubcontractIpc"
ADD CONSTRAINT "SubcontractIpc_payableInvoiceId_fkey"
FOREIGN KEY ("payableInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
