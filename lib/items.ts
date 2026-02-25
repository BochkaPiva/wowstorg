import { AvailabilityStatus, type Item } from "@prisma/client";

export function toDiscountedPrice(pricePerDay: number): number {
  return Number((pricePerDay * 0.76).toFixed(2));
}

export function computeRentableStock(
  item: Pick<Item, "stockTotal" | "stockInRepair" | "stockBroken" | "stockMissing" | "availabilityStatus">,
): number {
  if (item.availabilityStatus === AvailabilityStatus.RETIRED) {
    return 0;
  }

  return Math.max(0, item.stockTotal - item.stockInRepair - item.stockBroken - item.stockMissing);
}

export function computeAvailableQty(
  item: Pick<Item, "stockTotal" | "stockInRepair" | "stockBroken" | "stockMissing" | "availabilityStatus">,
  reservedQty: number,
): number {
  return Math.max(0, computeRentableStock(item) - reservedQty);
}
