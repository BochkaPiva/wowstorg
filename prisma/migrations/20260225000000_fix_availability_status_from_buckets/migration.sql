-- Backfill: set ACTIVE for items that have at least 1 available unit
-- (stock_total - stock_in_repair - stock_broken - stock_missing > 0)
-- so catalog shows them as available instead of broken/missing/needs_repair.
UPDATE "items"
SET "availability_status" = 'ACTIVE'
WHERE "availability_status" != 'RETIRED'
  AND ("stock_total" - "stock_in_repair" - "stock_broken" - "stock_missing") > 0;
