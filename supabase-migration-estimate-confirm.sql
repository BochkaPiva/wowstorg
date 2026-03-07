-- Миграция для Supabase: поля сметы и подтверждения Greenwich (orders)
-- Выполнить в Supabase Dashboard → SQL Editor.
-- Соответствует Prisma-миграции 20260228120000_add_estimate_confirm_snapshots

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "estimate_sent_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "estimate_sent_snapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "greenwich_confirmed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "greenwich_confirmed_snapshot" JSONB;
