import { AvailabilityStatus, type Item } from "@prisma/client";

export function toDiscountedPrice(pricePerDay: number): number {
  return Number((pricePerDay * 0.7).toFixed(2));
}

export function computeAvailableQty(
  item: Pick<Item, "stockTotal" | "availabilityStatus">,
  reservedQty: number,
): number {
  if (item.availabilityStatus !== AvailabilityStatus.ACTIVE) {
    return 0;
  }

  return Math.max(0, item.stockTotal - reservedQty);
}
