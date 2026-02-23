-- CreateEnum
CREATE TYPE "public"."OrderSource" AS ENUM ('GREENWICH_INTERNAL', 'WOWSTORG_EXTERNAL');

-- AlterTable
ALTER TABLE "public"."orders" ADD COLUMN     "customer_id" TEXT,
ADD COLUMN     "event_name" TEXT,
ADD COLUMN     "order_source" "public"."OrderSource" NOT NULL DEFAULT 'GREENWICH_INTERNAL';

-- CreateTable
CREATE TABLE "public"."customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_name_key" ON "public"."customers"("name");

-- CreateIndex
CREATE INDEX "customers_is_active_idx" ON "public"."customers"("is_active");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "public"."customers"("name");

-- CreateIndex
CREATE INDEX "orders_customer_id_status_idx" ON "public"."orders"("customer_id", "status");

-- AddForeignKey
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
