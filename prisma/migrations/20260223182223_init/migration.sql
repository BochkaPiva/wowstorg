-- CreateEnum
CREATE TYPE "Role" AS ENUM ('GREENWICH', 'WAREHOUSE', 'ADMIN');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('ASSET', 'BULK', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('ACTIVE', 'NEEDS_REPAIR', 'BROKEN', 'MISSING', 'RETIRED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'ISSUED', 'RETURN_DECLARED', 'CLOSED', 'CANCELLED', 'EMERGENCY_ISSUED');

-- CreateEnum
CREATE TYPE "CheckinCondition" AS ENUM ('OK', 'NEEDS_REPAIR', 'BROKEN', 'MISSING');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('NEEDS_REPAIR', 'BROKEN', 'MISSING');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "username" TEXT,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "item_type" "ItemType" NOT NULL,
    "availability_status" "AvailabilityStatus" NOT NULL DEFAULT 'ACTIVE',
    "stock_total" INTEGER NOT NULL DEFAULT 0,
    "price_per_day" DECIMAL(12,2) NOT NULL,
    "location_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_categories" (
    "item_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_categories_pkey" PRIMARY KEY ("item_id","category_id")
);

-- CreateTable
CREATE TABLE "kits" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kit_lines" (
    "id" TEXT NOT NULL,
    "kit_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "default_qty" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kit_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "issued_by" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'SUBMITTED',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "pickup_time" TEXT,
    "notes" TEXT,
    "discount_rate" DECIMAL(4,2) NOT NULL DEFAULT 0.30,
    "is_emergency" BOOLEAN NOT NULL DEFAULT false,
    "issued_at" TIMESTAMP(3),
    "return_declared_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "requested_qty" INTEGER NOT NULL,
    "approved_qty" INTEGER,
    "issued_qty" INTEGER,
    "price_per_day_snapshot" DECIMAL(12,2) NOT NULL,
    "source_kit_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkin_lines" (
    "id" TEXT NOT NULL,
    "order_line_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "returned_qty" INTEGER NOT NULL,
    "condition" "CheckinCondition" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkin_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "order_id" TEXT,
    "line_id" TEXT,
    "type" "IncidentType" NOT NULL,
    "description" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_images" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storage_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_photos" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storage_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incident_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "items_availability_status_idx" ON "items"("availability_status");

-- CreateIndex
CREATE INDEX "items_item_type_idx" ON "items"("item_type");

-- CreateIndex
CREATE INDEX "items_name_idx" ON "items"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "item_categories_category_id_idx" ON "item_categories"("category_id");

-- CreateIndex
CREATE INDEX "kits_is_active_idx" ON "kits"("is_active");

-- CreateIndex
CREATE INDEX "kit_lines_item_id_idx" ON "kit_lines"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "kit_lines_kit_id_item_id_key" ON "kit_lines"("kit_id", "item_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_start_date_end_date_idx" ON "orders"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "orders_status_start_date_end_date_idx" ON "orders"("status", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "orders_created_by_status_idx" ON "orders"("created_by", "status");

-- CreateIndex
CREATE INDEX "orders_approved_by_idx" ON "orders"("approved_by");

-- CreateIndex
CREATE INDEX "orders_issued_by_idx" ON "orders"("issued_by");

-- CreateIndex
CREATE INDEX "orders_is_emergency_status_idx" ON "orders"("is_emergency", "status");

-- CreateIndex
CREATE INDEX "orders_updated_at_idx" ON "orders"("updated_at");

-- CreateIndex
CREATE INDEX "order_lines_order_id_idx" ON "order_lines"("order_id");

-- CreateIndex
CREATE INDEX "order_lines_item_id_idx" ON "order_lines"("item_id");

-- CreateIndex
CREATE INDEX "order_lines_source_kit_id_idx" ON "order_lines"("source_kit_id");

-- CreateIndex
CREATE INDEX "order_lines_order_id_item_id_idx" ON "order_lines"("order_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkin_lines_order_line_id_key" ON "checkin_lines"("order_line_id");

-- CreateIndex
CREATE INDEX "checkin_lines_condition_idx" ON "checkin_lines"("condition");

-- CreateIndex
CREATE INDEX "checkin_lines_created_by_idx" ON "checkin_lines"("created_by");

-- CreateIndex
CREATE INDEX "incidents_item_id_created_at_idx" ON "incidents"("item_id", "created_at");

-- CreateIndex
CREATE INDEX "incidents_order_id_idx" ON "incidents"("order_id");

-- CreateIndex
CREATE INDEX "incidents_line_id_idx" ON "incidents"("line_id");

-- CreateIndex
CREATE INDEX "incidents_type_created_at_idx" ON "incidents"("type", "created_at");

-- CreateIndex
CREATE INDEX "item_images_item_id_idx" ON "item_images"("item_id");

-- CreateIndex
CREATE INDEX "incident_photos_incident_id_idx" ON "incident_photos"("incident_id");

-- AddForeignKey
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kit_lines" ADD CONSTRAINT "kit_lines_kit_id_fkey" FOREIGN KEY ("kit_id") REFERENCES "kits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kit_lines" ADD CONSTRAINT "kit_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_source_kit_id_fkey" FOREIGN KEY ("source_kit_id") REFERENCES "kits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_lines" ADD CONSTRAINT "checkin_lines_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_lines" ADD CONSTRAINT "checkin_lines_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_images" ADD CONSTRAINT "item_images_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_photos" ADD CONSTRAINT "incident_photos_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
