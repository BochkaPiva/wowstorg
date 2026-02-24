-- Add quantitative stock buckets and lost items registry.
ALTER TABLE "items"
ADD COLUMN "stock_in_repair" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "stock_missing" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "stock_broken" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "LostItemStatus" AS ENUM ('OPEN', 'FOUND', 'WRITTEN_OFF');

CREATE TABLE "lost_items" (
  "id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "order_line_id" TEXT NOT NULL,
  "checkin_line_id" TEXT,
  "detected_by" TEXT NOT NULL,
  "customer_telegram_id" TEXT NOT NULL,
  "customer_name_snapshot" TEXT,
  "event_name_snapshot" TEXT,
  "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lost_qty" INTEGER NOT NULL,
  "status" "LostItemStatus" NOT NULL DEFAULT 'OPEN',
  "note" TEXT,
  "resolved_at" TIMESTAMP(3),
  "resolved_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "lost_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lost_items_status_detected_at_idx" ON "lost_items"("status", "detected_at");
CREATE INDEX "lost_items_item_id_status_idx" ON "lost_items"("item_id", "status");
CREATE INDEX "lost_items_order_id_idx" ON "lost_items"("order_id");
CREATE INDEX "lost_items_customer_telegram_id_idx" ON "lost_items"("customer_telegram_id");

ALTER TABLE "lost_items"
ADD CONSTRAINT "lost_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lost_items"
ADD CONSTRAINT "lost_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lost_items"
ADD CONSTRAINT "lost_items_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lost_items"
ADD CONSTRAINT "lost_items_checkin_line_id_fkey" FOREIGN KEY ("checkin_line_id") REFERENCES "checkin_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lost_items"
ADD CONSTRAINT "lost_items_detected_by_fkey" FOREIGN KEY ("detected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lost_items"
ADD CONSTRAINT "lost_items_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
