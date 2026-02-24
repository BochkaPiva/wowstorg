import { LostItemStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { resolveAvailabilityStatusFromBuckets } from "@/lib/item-status";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

function parseStatus(raw: unknown): LostItemStatus | null {
  if (raw === LostItemStatus.OPEN || raw === LostItemStatus.FOUND || raw === LostItemStatus.WRITTEN_OFF) {
    return raw;
  }
  return null;
}

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const existing = await prisma.lostItem.findUnique({ where: { id } });
  if (!existing) {
    return fail(404, "Lost item not found.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid JSON body.");
  }
  if (!body || typeof body !== "object") {
    return fail(400, "Invalid payload.");
  }
  const payload = body as Record<string, unknown>;
  const nextStatus = parseStatus(payload.status);
  if (!nextStatus) {
    return fail(400, "status must be OPEN, FOUND or WRITTEN_OFF.");
  }
  const note =
    payload.note === null
      ? null
      : typeof payload.note === "string"
        ? payload.note.trim() || null
        : undefined;
  if (payload.note !== undefined && note === undefined) {
    return fail(400, "note must be string or null.");
  }

  const isResolved = nextStatus !== LostItemStatus.OPEN;
  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.item.findUnique({ where: { id: existing.itemId } });
    if (!item) {
      throw new Error("Item not found for lost entry.");
    }

    let stockMissingDelta = 0;
    let stockTotalDelta = 0;
    if (existing.status === LostItemStatus.OPEN && nextStatus === LostItemStatus.FOUND) {
      stockMissingDelta = -existing.lostQty;
    }
    if (existing.status === LostItemStatus.OPEN && nextStatus === LostItemStatus.WRITTEN_OFF) {
      stockMissingDelta = -existing.lostQty;
      stockTotalDelta = -existing.lostQty;
    }
    if (
      (existing.status === LostItemStatus.FOUND || existing.status === LostItemStatus.WRITTEN_OFF) &&
      nextStatus === LostItemStatus.OPEN
    ) {
      stockMissingDelta = existing.lostQty;
      if (existing.status === LostItemStatus.WRITTEN_OFF) {
        stockTotalDelta = existing.lostQty;
      }
    }

    const nextStockMissing = Math.max(0, item.stockMissing + stockMissingDelta);
    const nextStockTotal = Math.max(0, item.stockTotal + stockTotalDelta);

    await tx.item.update({
      where: { id: item.id },
      data: {
        stockMissing: nextStockMissing,
        stockTotal: nextStockTotal,
        availabilityStatus: resolveAvailabilityStatusFromBuckets({
          currentStatus: item.availabilityStatus,
          stockInRepair: item.stockInRepair,
          stockBroken: item.stockBroken,
          stockMissing: nextStockMissing,
        }),
      },
    });

    return tx.lostItem.update({
      where: { id },
      data: {
        status: nextStatus,
        note: note !== undefined ? note : existing.note,
        resolvedAt: isResolved ? new Date() : null,
        resolvedById: isResolved ? auth.user.id : null,
      },
      include: {
        item: { select: { id: true, name: true } },
        order: { select: { id: true } },
      },
    });
  });

  return NextResponse.json({
    lostItem: {
      id: updated.id,
      status: updated.status,
      item: updated.item,
      orderId: updated.order.id,
      lostQty: updated.lostQty,
      note: updated.note,
      resolvedAt: updated.resolvedAt?.toISOString() ?? null,
    },
  });
}
