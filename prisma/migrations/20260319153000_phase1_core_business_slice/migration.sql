ALTER TABLE "Project"
ADD COLUMN IF NOT EXISTS "contractId" INTEGER;

ALTER TABLE "ProjectExpense"
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

UPDATE "ProjectExpense"
SET "updatedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE "updatedAt" IS NULL;

ALTER TABLE "ProjectExpense"
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ProjectExpense"
ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "PayrollRun"
ADD COLUMN IF NOT EXISTS "branchId" INTEGER;

ALTER TABLE "PayrollLine"
ADD COLUMN IF NOT EXISTS "branchId" INTEGER;

CREATE TABLE IF NOT EXISTS "Attendance" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "hoursWorked" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Attendance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Timesheet" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "projectExpenseId" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "hourlyCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedBy" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Timesheet_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Timesheet_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Timesheet_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Timesheet_projectExpenseId_fkey" FOREIGN KEY ("projectExpenseId") REFERENCES "ProjectExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Timesheet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "UserBranchAccess" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT true,
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBranchAccess_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserBranchAccess_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserBranchAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_contractId_fkey') THEN
    ALTER TABLE "Project"
    ADD CONSTRAINT "Project_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayrollRun_branchId_fkey') THEN
    ALTER TABLE "PayrollRun"
    ADD CONSTRAINT "PayrollRun_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayrollLine_branchId_fkey') THEN
    ALTER TABLE "PayrollLine"
    ADD CONSTRAINT "PayrollLine_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Project_contractId_idx" ON "Project"("contractId");
CREATE INDEX IF NOT EXISTS "PayrollRun_branchId_year_month_idx" ON "PayrollRun"("branchId", "year", "month");
CREATE INDEX IF NOT EXISTS "PayrollLine_branchId_idx" ON "PayrollLine"("branchId");
CREATE INDEX IF NOT EXISTS "PayrollLine_employeeId_idx" ON "PayrollLine"("employeeId");
CREATE INDEX IF NOT EXISTS "PayrollLine_payrollRunId_idx" ON "PayrollLine"("payrollRunId");
CREATE UNIQUE INDEX IF NOT EXISTS "Attendance_employeeId_date_key" ON "Attendance"("employeeId", "date");
CREATE INDEX IF NOT EXISTS "Attendance_branchId_date_idx" ON "Attendance"("branchId", "date");
CREATE INDEX IF NOT EXISTS "Timesheet_branchId_date_idx" ON "Timesheet"("branchId", "date");
CREATE INDEX IF NOT EXISTS "Timesheet_employeeId_date_idx" ON "Timesheet"("employeeId", "date");
CREATE INDEX IF NOT EXISTS "Timesheet_projectId_date_idx" ON "Timesheet"("projectId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "UserBranchAccess_userId_branchId_key" ON "UserBranchAccess"("userId", "branchId");
CREATE INDEX IF NOT EXISTS "UserBranchAccess_branchId_idx" ON "UserBranchAccess"("branchId");
