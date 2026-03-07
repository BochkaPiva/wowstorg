import { OrderStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { orderStateEqualsSnapshot, type OrderEstimateSnapshot } from "@/lib/order-estimate-flow";
import { prisma } from "@/lib/prisma";

function minutesAgo(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

/** Человекочитаемая подпись "обновлено N мин/ч/дн/нед назад". */
function formatUpdatedAgo(date: Date): string {
  const min = minutesAgo(date);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн назад`;
  const weeks = Math.floor(days / 7);
  return `${weeks} нед назад`;
}

const QUEUE_STATUSES: OrderStatus[] = [
  OrderStatus.SUBMITTED,
  OrderStatus.APPROVED,
  OrderStatus.ISSUED,
  OrderStatus.EMERGENCY_ISSUED,
  OrderStatus.RETURN_DECLARED,
];

const CLIENT_DECLARATION_MARKER = "CLIENT_RETURN_DECLARATION_B64:";

type ClientDeclaredSegment = { condition: "OK" | "NEEDS_REPAIR" | "BROKEN" | "MISSING"; qty: number };
type ClientDeclaredLine = {
  orderLineId: string;
  itemId: string;
  returnedQty: number;
  issuedQty: number;
  condition: "OK" | "NEEDS_REPAIR" | "BROKEN" | "MISSING";
  comment: string | null;
  segments?: ClientDeclaredSegment[];
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
      lines?: Array<ClientDeclaredLine & { segments?: ClientDeclaredSegment[] }>;
      comment?: string | null;
    };
    const lines = Array.isArray(decoded.lines) ? decoded.lines : [];
    return {
      lines: lines.map((line) => ({
        orderLineId: line.orderLineId,
        itemId: line.itemId,
        returnedQty: line.returnedQty,
        issuedQty: line.issuedQty,
        condition: line.condition,
        comment: line.comment ?? null,
        segments: line.segments,
      })),
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
    orderBy: [{ updatedAt: "desc" }],
  });

  const statusOrder: Record<OrderStatus, number> = {
    SUBMITTED: 0,
    APPROVED: 1,
    RETURN_DECLARED: 2,
    ISSUED: 3,
    EMERGENCY_ISSUED: 3,
    CLOSED: 4,
    CANCELLED: 5,
  };

  const sorted = [...orders].sort((a, b) => {
    const statusA = statusOrder[a.status];
    const statusB = statusOrder[b.status];
    if (statusA !== statusB) return statusA - statusB;
    if (a.status === "SUBMITTED" || a.status === "APPROVED") {
      const byReady = a.readyByDate.getTime() - b.readyByDate.getTime();
      if (byReady !== 0) return byReady;
      return (b.isEmergency ? 1 : 0) - (a.isEmergency ? 1 : 0);
    }
    const byEnd = a.endDate.getTime() - b.endDate.getTime();
    if (byEnd !== 0) return byEnd;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  const visibleOrders = sorted.filter((order) => {
    if (order.status !== OrderStatus.ISSUED && order.status !== OrderStatus.EMERGENCY_ISSUED) {
      return true;
    }
    // Hide issued orders that contain only consumables:
    // they do not require check-in and clutter operational queue.
    return order.lines.some((line) => line.item.itemType !== "CONSUMABLE");
  });

  return NextResponse.json({
    orders: visibleOrders.map((order) => {
      const o = order as (typeof visibleOrders)[0];
      return {
        id: o.id,
        status: o.status,
        isEmergency: o.isEmergency,
        orderSource: o.orderSource,
        createdViaQuickIssue: o.createdViaQuickIssue,
        customerId: o.customerId,
        customerName: o.customer?.name ?? null,
        eventName: o.eventName,
        updatedAt: o.updatedAt.toISOString(),
        updatedMinutesAgo: minutesAgo(o.updatedAt),
        updatedAgoLabel: formatUpdatedAgo(o.updatedAt),
        startDate: o.startDate.toISOString().slice(0, 10),
        endDate: o.endDate.toISOString().slice(0, 10),
        readyByDate: o.readyByDate.toISOString().slice(0, 10),
        pickupTime: o.pickupTime,
        notes: o.notes,
        deliveryRequested: o.deliveryRequested,
        deliveryComment: o.deliveryComment ?? null,
        mountRequested: o.mountRequested,
        mountComment: o.mountComment ?? null,
        dismountRequested: o.dismountRequested,
        dismountComment: o.dismountComment ?? null,
        deliveryPrice: o.deliveryPrice != null ? Number(o.deliveryPrice) : null,
        mountPrice: o.mountPrice != null ? Number(o.mountPrice) : null,
        dismountPrice: o.dismountPrice != null ? Number(o.dismountPrice) : null,
        warehouseInternalNote: o.warehouseInternalNote ?? null,
        estimateSentAt: o.estimateSentAt?.toISOString() ?? null,
        greenwichConfirmedAt: o.greenwichConfirmedAt?.toISOString() ?? null,
        canApprove:
          o.status === "SUBMITTED" &&
          (o.orderSource !== "GREENWICH_INTERNAL" ||
            (o.greenwichConfirmedAt != null &&
              orderStateEqualsSnapshot(o, o.greenwichConfirmedSnapshot as OrderEstimateSnapshot | null))),
        clientDeclaration: parseClientDeclaration(o.notes),
        createdBy: {
          id: o.createdBy.id,
          username: o.createdBy.username,
          telegramId: o.createdBy.telegramId.toString(),
        },
        lines: o.lines.map((line) => ({
          id: line.id,
          itemId: line.itemId,
          itemName: line.item.name,
          itemType: line.item.itemType,
          requestedQty: line.requestedQty,
          approvedQty: line.approvedQty,
          issuedQty: line.issuedQty,
        })),
      };
    }),
  });
}
