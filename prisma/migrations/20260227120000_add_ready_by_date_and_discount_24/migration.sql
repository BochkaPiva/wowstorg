-- Add ready_by_date (required for sorting and display). Backfill from start_date.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "ready_by_date" DATE;
UPDATE "orders" SET "ready_by_date" = "start_date" WHERE "ready_by_date" IS NULL;
ALTER TABLE "orders" ALTER COLUMN "ready_by_date" SET NOT NULL;

-- Create index for queue sorting
CREATE INDEX IF NOT EXISTS "orders_ready_by_date_idx" ON "orders"("ready_by_date");

-- Change default discount from 30% to 24% (existing rows keep current value)
ALTER TABLE "orders" ALTER COLUMN "discount_rate" SET DEFAULT 0.24;
