-- AlterTable
ALTER TABLE "orders" ADD COLUMN "delivery_requested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "delivery_comment" TEXT;
ALTER TABLE "orders" ADD COLUMN "mount_requested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "mount_comment" TEXT;
ALTER TABLE "orders" ADD COLUMN "dismount_requested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "dismount_comment" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivery_price" DECIMAL(12,2);
ALTER TABLE "orders" ADD COLUMN "mount_price" DECIMAL(12,2);
ALTER TABLE "orders" ADD COLUMN "dismount_price" DECIMAL(12,2);
