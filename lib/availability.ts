import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ACTIVE_RESERVATION_STATUSES: OrderStatus[] = [
  OrderStatus.APPROVED,
  OrderStatus.ISSUED,
  OrderStatus.RETURN_DECLARED,
  OrderStatus.EMERGENCY_ISSUED,
];

export async function getReservedQtyMap(
  itemIds: string[],
  startDate: Date,
  endDate: Date,
): Promise<Map<string, number>> {
  if (itemIds.length === 0) {
    return new Map();
  }

  const lines = await prisma.orderLine.findMany({
    where: {
      itemId: { in: itemIds },
      order: {
        status: { in: ACTIVE_RESERVATION_STATUSES },
        startDate: { lt: endDate },
        endDate: { gt: startDate },
      },
    },
    select: {
      itemId: true,
      issuedQty: true,
      approvedQty: true,
      requestedQty: true,
    },
  });

  const reservedByItem = new Map<string, number>();

  for (const line of lines) {
    const priorityQty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
    const current = reservedByItem.get(line.itemId) ?? 0;
    reservedByItem.set(line.itemId, current + priorityQty);
  }

  return reservedByItem;
}
