import { OrderStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

function minutesAgo(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

const QUEUE_STATUSES: OrderStatus[] = [
  OrderStatus.SUBMITTED,
  OrderStatus.APPROVED,
  OrderStatus.ISSUED,
  OrderStatus.RETURN_DECLARED,
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const orders = await prisma.order.findMany({
    where: {
      status: { in: QUEUE_STATUSES },
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
        },
      },
      lines: {
        include: {
          item: {
            select: {
              id: true,
              name: true,
              itemType: true,
            },
          },
        },
        orderBy: [{ createdAt: "asc" }],
      },
      createdBy: {
        select: {
          id: true,
          username: true,
          telegramId: true,
        },
      },
    },
    orderBy: [{ isEmergency: "desc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json({
    orders: orders.map((order) => ({
      id: order.id,
      status: order.status,
      isEmergency: order.isEmergency,
      orderSource: order.orderSource,
      customerId: order.customerId,
      customerName: order.customer?.name ?? null,
      eventName: order.eventName,
      updatedAt: order.updatedAt.toISOString(),
      updatedMinutesAgo: minutesAgo(order.updatedAt),
      startDate: order.startDate.toISOString().slice(0, 10),
      endDate: order.endDate.toISOString().slice(0, 10),
      pickupTime: order.pickupTime,
      notes: order.notes,
      createdBy: {
        id: order.createdBy.id,
        username: order.createdBy.username,
        telegramId: order.createdBy.telegramId.toString(),
      },
      lines: order.lines.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        itemName: line.item.name,
        itemType: line.item.itemType,
        requestedQty: line.requestedQty,
        approvedQty: line.approvedQty,
        issuedQty: line.issuedQty,
      })),
    })),
  });
}
