-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "estimate_sent_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "estimate_sent_snapshot" JSONB,
ADD COLUMN IF NOT EXISTS "greenwich_confirmed_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "greenwich_confirmed_snapshot" JSONB;
