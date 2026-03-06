-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "created_via_quick_issue" BOOLEAN NOT NULL DEFAULT false;
