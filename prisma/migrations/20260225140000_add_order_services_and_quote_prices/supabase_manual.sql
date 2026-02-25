-- Миграция: услуги заявки (доставка/монтаж/демонтаж) и цены для сметы.
-- Выполни в Supabase SQL Editor один раз.
-- Идемпотентно: можно запускать повторно (колонки не дублируются).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_requested'
  ) THEN
    ALTER TABLE "orders" ADD COLUMN "delivery_requested" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_comment'
  ) THEN
    ALTER TABLE "orders" ADD COLUMN "delivery_comment" TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'mount_requested'
  ) THEN
    ALTER TABLE "orders" ADD COLUMN "mount_requested" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'mount_comment'
  ) THEN
    ALTER TABLE "orders" ADD COLUMN "mount_comment" TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'dismount_requested'
  ) THEN
    ALTER TABLE "orders" ADD COLUMN "dismount_requested" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'dismount_comment'
  ) THEN
    ALTER TABLE "orders" ADD COLUMN "dismount_comment" TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_price'
  ) THEN
    ALTER TABLE "orders" ADD COLUMN "delivery_price" DECIMAL(12,2);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'mount_price'
  ) THEN
    ALTER TABLE "orders" ADD COLUMN "mount_price" DECIMAL(12,2);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'dismount_price'
  ) THEN
    ALTER TABLE "orders" ADD COLUMN "dismount_price" DECIMAL(12,2);
  END IF;
END $$;
