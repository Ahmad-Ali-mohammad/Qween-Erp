CREATE TABLE "Subcontractor" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "specialty" TEXT,
    "licenseNumber" TEXT,
    "rating" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subcontractor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubcontractContract" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "subcontractorId" INTEGER NOT NULL,
    "projectId" INTEGER,
    "branchId" INTEGER,
    "title" TEXT NOT NULL,
    "scopeOfWork" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "amount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "retentionRate" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "certifiedAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "terms" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubcontractContract_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubcontractWorkOrder" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubcontractWorkOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubcontractCertificate" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "projectId" INTEGER,
    "branchId" INTEGER,
    "number" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "certificateDate" TIMESTAMP(3) NOT NULL,
    "progressPercent" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "retentionAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "projectExpenseId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubcontractCertificate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubcontractChangeOrder" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "projectId" INTEGER,
    "branchId" INTEGER,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "requestedDate" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubcontractChangeOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubcontractPayment" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "certificateId" INTEGER,
    "projectId" INTEGER,
    "branchId" INTEGER,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "method" TEXT,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubcontractPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subcontractor_code_key" ON "Subcontractor"("code");
CREATE UNIQUE INDEX "SubcontractContract_number_key" ON "SubcontractContract"("number");
CREATE UNIQUE INDEX "SubcontractWorkOrder_number_key" ON "SubcontractWorkOrder"("number");
CREATE UNIQUE INDEX "SubcontractCertificate_number_key" ON "SubcontractCertificate"("number");
CREATE UNIQUE INDEX "SubcontractChangeOrder_number_key" ON "SubcontractChangeOrder"("number");

CREATE INDEX "Subcontractor_status_idx" ON "Subcontractor"("status");
CREATE INDEX "Subcontractor_specialty_idx" ON "Subcontractor"("specialty");
CREATE INDEX "SubcontractContract_subcontractorId_status_idx" ON "SubcontractContract"("subcontractorId", "status");
CREATE INDEX "SubcontractContract_projectId_status_idx" ON "SubcontractContract"("projectId", "status");
CREATE INDEX "SubcontractContract_branchId_status_idx" ON "SubcontractContract"("branchId", "status");
CREATE INDEX "SubcontractWorkOrder_contractId_issueDate_idx" ON "SubcontractWorkOrder"("contractId", "issueDate");
CREATE INDEX "SubcontractCertificate_contractId_status_idx" ON "SubcontractCertificate"("contractId", "status");
CREATE INDEX "SubcontractCertificate_projectId_status_idx" ON "SubcontractCertificate"("projectId", "status");
CREATE INDEX "SubcontractCertificate_branchId_certificateDate_idx" ON "SubcontractCertificate"("branchId", "certificateDate");
CREATE INDEX "SubcontractChangeOrder_contractId_status_idx" ON "SubcontractChangeOrder"("contractId", "status");
CREATE INDEX "SubcontractChangeOrder_projectId_status_idx" ON "SubcontractChangeOrder"("projectId", "status");
CREATE INDEX "SubcontractChangeOrder_branchId_requestedDate_idx" ON "SubcontractChangeOrder"("branchId", "requestedDate");
CREATE INDEX "SubcontractPayment_contractId_paymentDate_idx" ON "SubcontractPayment"("contractId", "paymentDate");
CREATE INDEX "SubcontractPayment_certificateId_paymentDate_idx" ON "SubcontractPayment"("certificateId", "paymentDate");
CREATE INDEX "SubcontractPayment_projectId_paymentDate_idx" ON "SubcontractPayment"("projectId", "paymentDate");
CREATE INDEX "SubcontractPayment_branchId_paymentDate_idx" ON "SubcontractPayment"("branchId", "paymentDate");

ALTER TABLE "SubcontractContract" ADD CONSTRAINT "SubcontractContract_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubcontractContract" ADD CONSTRAINT "SubcontractContract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubcontractContract" ADD CONSTRAINT "SubcontractContract_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SubcontractWorkOrder" ADD CONSTRAINT "SubcontractWorkOrder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SubcontractContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubcontractCertificate" ADD CONSTRAINT "SubcontractCertificate_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SubcontractContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubcontractCertificate" ADD CONSTRAINT "SubcontractCertificate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubcontractCertificate" ADD CONSTRAINT "SubcontractCertificate_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubcontractCertificate" ADD CONSTRAINT "SubcontractCertificate_projectExpenseId_fkey" FOREIGN KEY ("projectExpenseId") REFERENCES "ProjectExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SubcontractChangeOrder" ADD CONSTRAINT "SubcontractChangeOrder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SubcontractContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubcontractChangeOrder" ADD CONSTRAINT "SubcontractChangeOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubcontractChangeOrder" ADD CONSTRAINT "SubcontractChangeOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SubcontractPayment" ADD CONSTRAINT "SubcontractPayment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SubcontractContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubcontractPayment" ADD CONSTRAINT "SubcontractPayment_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "SubcontractCertificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubcontractPayment" ADD CONSTRAINT "SubcontractPayment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubcontractPayment" ADD CONSTRAINT "SubcontractPayment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
