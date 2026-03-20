CREATE TABLE IF NOT EXISTS "Tender" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "branchId" INTEGER,
    "customerId" INTEGER,
    "opportunityId" INTEGER,
    "contractId" INTEGER,
    "projectId" INTEGER,
    "issuerName" TEXT,
    "bidDueDate" TIMESTAMP(3),
    "estimatedValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "offeredValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "guaranteeAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "result" TEXT,
    "resultReason" TEXT,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "awardedAt" TIMESTAMP(3),
    "resultRecordedAt" TIMESTAMP(3),
    "approvalStatus" "ApprovalLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "postingStatus" "PostingLifecycleStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "attachmentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Tender_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Tender_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Tender_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TenderEstimateLine" (
    "id" SERIAL NOT NULL,
    "tenderId" INTEGER NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "category" TEXT,
    "description" TEXT NOT NULL,
    "costType" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderEstimateLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TenderEstimateLine_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TenderCompetitor" (
    "id" SERIAL NOT NULL,
    "tenderId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "offeredValue" DECIMAL(65,30),
    "rank" INTEGER,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderCompetitor_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TenderCompetitor_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Tender_number_key" ON "Tender"("number");
CREATE INDEX IF NOT EXISTS "Tender_branchId_idx" ON "Tender"("branchId");
CREATE INDEX IF NOT EXISTS "Tender_customerId_idx" ON "Tender"("customerId");
CREATE INDEX IF NOT EXISTS "Tender_opportunityId_idx" ON "Tender"("opportunityId");
CREATE INDEX IF NOT EXISTS "Tender_status_idx" ON "Tender"("status");
CREATE INDEX IF NOT EXISTS "Tender_result_idx" ON "Tender"("result");
CREATE UNIQUE INDEX IF NOT EXISTS "TenderEstimateLine_tenderId_lineNumber_key" ON "TenderEstimateLine"("tenderId", "lineNumber");
