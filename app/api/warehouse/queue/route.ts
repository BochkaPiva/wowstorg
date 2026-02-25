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

const CLIENT_DECLARATION_MARKER = "CLIENT_RETURN_DECLARATION_B64:";

type ClientDeclaredLine = {
  orderLineId: string;
  itemId: string;
  returnedQty: number;
  issuedQty: number;
  condition: "OK" | "NEEDS_REPAIR" | "BROKEN" | "MISSING";
  comment: string | null;
};

function parseClientDeclaration(noteText: string | null): {
  lines: ClientDeclaredLine[];
  comment: string | null;
} | null {
  if (!noteText || !noteText.includes(CLIENT_DECLARATION_MARKER)) {
    return null;
  }

  const markerIndex = noteText.lastIndexOf(CLIENT_DECLARATION_MARKER);
  if (markerIndex < 0) return null;
  const encoded = noteText.slice(markerIndex + CLIENT_DECLARATION_MARKER.length).trim();
  if (!encoded) return null;

  try {
    const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as {
      lines?: ClientDeclaredLine[];
      comment?: string | null;
    };
    return {
      lines: Array.isArray(decoded.lines) ? decoded.lines : [],
      comment: decoded.comment ?? null,
    };
  } catch {
    return null;
  }
}

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
    orderBy: [{ readyByDate: "asc" }, { isEmergency: "desc" }, { updatedAt: "desc" }],
  });

  const visibleOrders = orders.filter((order) => {
    if (order.status !== OrderStatus.ISSUED) {
      return true;
    }
    // Hide issued orders that contain only consumables:
    // they do not require check-in and clutter operational queue.
    return order.lines.some((line) => line.item.itemType !== "CONSUMABLE");
  });

  return NextResponse.json({
    orders: visibleOrders.map((order) => ({
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
      readyByDate: order.readyByDate.toISOString().slice(0, 10),
      pickupTime: order.pickupTime,
      notes: order.notes,
      deliveryRequested: order.deliveryRequested,
      deliveryComment: order.deliveryComment ?? null,
      mountRequested: order.mountRequested,
      mountComment: order.mountComment ?? null,
      dismountRequested: order.dismountRequested,
      dismountComment: order.dismountComment ?? null,
      deliveryPrice: order.deliveryPrice != null ? Number(order.deliveryPrice) : null,
      mountPrice: order.mountPrice != null ? Number(order.mountPrice) : null,
      dismountPrice: order.dismountPrice != null ? Number(order.dismountPrice) : null,
      warehouseInternalNote: order.warehouseInternalNote ?? null,
      clientDeclaration: parseClientDeclaration(order.notes),
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
