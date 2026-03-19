CREATE TABLE IF NOT EXISTS "DocumentTemplate" (
  "id" SERIAL NOT NULL,
  "key" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "nameAr" TEXT NOT NULL,
  "nameEn" TEXT,
  "branchId" INTEGER,
  "format" TEXT NOT NULL DEFAULT 'HTML',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "content" TEXT NOT NULL,
  "sampleData" JSONB,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentTemplate_key_key" ON "DocumentTemplate"("key");
CREATE INDEX IF NOT EXISTS "DocumentTemplate_entityType_isActive_idx" ON "DocumentTemplate"("entityType", "isActive");
CREATE INDEX IF NOT EXISTS "DocumentTemplate_branchId_entityType_idx" ON "DocumentTemplate"("branchId", "entityType");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'DocumentTemplate_branchId_fkey'
      AND table_name = 'DocumentTemplate'
  ) THEN
    ALTER TABLE "DocumentTemplate"
      ADD CONSTRAINT "DocumentTemplate_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
