CREATE TABLE IF NOT EXISTS "PrintJob" (
  "id" SERIAL NOT NULL,
  "jobKey" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "recordId" INTEGER,
  "templateId" INTEGER,
  "format" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'INLINE',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedBy" INTEGER,
  "attachmentId" INTEGER,
  "fileName" TEXT,
  "errorMessage" TEXT,
  "payload" JSONB,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PrintJob_jobKey_key" ON "PrintJob"("jobKey");
CREATE INDEX IF NOT EXISTS "PrintJob_entityType_recordId_idx" ON "PrintJob"("entityType", "recordId");
CREATE INDEX IF NOT EXISTS "PrintJob_status_createdAt_idx" ON "PrintJob"("status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'PrintJob_requestedBy_fkey'
      AND table_name = 'PrintJob'
  ) THEN
    ALTER TABLE "PrintJob"
      ADD CONSTRAINT "PrintJob_requestedBy_fkey"
      FOREIGN KEY ("requestedBy") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
