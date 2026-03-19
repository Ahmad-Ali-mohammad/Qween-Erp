ALTER TABLE "PayrollRun"
ADD COLUMN "branchId" INTEGER;

ALTER TABLE "PayrollLine"
ADD COLUMN "branchId" INTEGER;

UPDATE "PayrollLine" AS pl
SET "branchId" = e."branchId"
FROM "Employee" AS e
WHERE pl."employeeId" = e."id"
  AND pl."branchId" IS NULL;

WITH single_branch_runs AS (
  SELECT pl."payrollRunId", MIN(pl."branchId") AS "branchId"
  FROM "PayrollLine" AS pl
  WHERE pl."branchId" IS NOT NULL
  GROUP BY pl."payrollRunId"
  HAVING COUNT(DISTINCT pl."branchId") = 1
)
UPDATE "PayrollRun" AS pr
SET "branchId" = sbr."branchId"
FROM single_branch_runs AS sbr
WHERE pr."id" = sbr."payrollRunId"
  AND pr."branchId" IS NULL;

CREATE INDEX "PayrollRun_branchId_year_month_idx" ON "PayrollRun"("branchId", "year", "month");
CREATE INDEX "PayrollLine_payrollRunId_idx" ON "PayrollLine"("payrollRunId");
CREATE INDEX "PayrollLine_employeeId_idx" ON "PayrollLine"("employeeId");
CREATE INDEX "PayrollLine_branchId_idx" ON "PayrollLine"("branchId");

ALTER TABLE "PayrollRun"
ADD CONSTRAINT "PayrollRun_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PayrollLine"
ADD CONSTRAINT "PayrollLine_payrollRunId_fkey"
FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollLine"
ADD CONSTRAINT "PayrollLine_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollLine"
ADD CONSTRAINT "PayrollLine_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
