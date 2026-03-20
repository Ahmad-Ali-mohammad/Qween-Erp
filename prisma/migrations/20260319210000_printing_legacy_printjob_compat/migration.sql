DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PrintJob' AND column_name = 'jobKey'
  ) THEN
    ALTER TABLE "PrintJob" ALTER COLUMN "jobKey" DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PrintJob' AND column_name = 'format'
  ) THEN
    ALTER TABLE "PrintJob" ALTER COLUMN "format" SET DEFAULT 'PDF';
  END IF;
END $$;
