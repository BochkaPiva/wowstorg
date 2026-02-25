-- AlterTable
ALTER TABLE "checkin_lines" ADD COLUMN IF NOT EXISTS "return_segments" JSONB;
