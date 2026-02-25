import { AvailabilityStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { resolveAvailabilityStatusFromBuckets } from "@/lib/item-status";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  // Только ремонт и сломанные; утерянные — в отдельном реестре «Утерянный реквизит».
  const items = await prisma.item.findMany({
    where: {
      OR: [
        { availabilityStatus: AvailabilityStatus.RETIRED },
        { stockInRepair: { gt: 0 } },
        { stockBroken: { gt: 0 } },
      ],
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      availabilityStatus: item.availabilityStatus,
      stockTotal: item.stockTotal,
      stockInRepair: item.stockInRepair,
      stockBroken: item.stockBroken,
      stockMissing: item.stockMissing,
      updatedAt: item.updatedAt.toISOString(),
      locationText: item.locationText,
    })),
  });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body." } }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: { message: "Invalid payload." } }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  const itemId = typeof payload.itemId === "string" ? payload.itemId.trim() : "";
  if (!itemId) {
    return NextResponse.json({ error: { message: "itemId is required." } }, { status: 400 });
  }

  const action = payload.action;
  if (action !== "REPAIR" && action !== "WRITE_OFF" && action !== "WRITE_OFF_MISSING") {
    return NextResponse.json(
      { error: { message: "action must be REPAIR, WRITE_OFF or WRITE_OFF_MISSING." } },
      { status: 400 },
    );
  }
  const quantity =
    typeof payload.quantity === "number" && Number.isInteger(payload.quantity) && payload.quantity >= 0
      ? payload.quantity
      : null;
  const quantityFromRepair =
    typeof payload.quantityFromRepair === "number" && Number.isInteger(payload.quantityFromRepair) && payload.quantityFromRepair >= 0
      ? payload.quantityFromRepair
      : null;
  const quantityFromBroken =
    typeof payload.quantityFromBroken === "number" && Number.isInteger(payload.quantityFromBroken) && payload.quantityFromBroken >= 0
      ? payload.quantityFromBroken
      : null;
  const useSplit = quantityFromRepair !== null && quantityFromBroken !== null;
  if (!useSplit && (quantity === null || quantity < 1)) {
    return NextResponse.json({ error: { message: "quantity must be positive integer, or set both quantityFromRepair and quantityFromBroken." } }, { status: 400 });
  }
  if (action === "WRITE_OFF_MISSING" && (quantity === null || quantity < 1)) {
    return NextResponse.json({ error: { message: "quantity must be positive integer for WRITE_OFF_MISSING." } }, { status: 400 });
  }

  const current = await prisma.item.findUnique({ where: { id: itemId } });
  if (!current) {
    return NextResponse.json({ error: { message: "Item not found." } }, { status: 404 });
  }

  if (action === "WRITE_OFF_MISSING") {
    const qty = quantity!;
    if (current.stockMissing < qty) {
      return NextResponse.json(
        { error: { message: "Недостаточно утерянных единиц для списания." } },
        { status: 400 },
      );
    }
    const nextMissing = current.stockMissing - qty;
    const nextTotal = Math.max(0, current.stockTotal - qty);
    const nextStatus = resolveAvailabilityStatusFromBuckets({
      currentStatus: current.availabilityStatus,
      stockTotal: nextTotal,
      stockInRepair: current.stockInRepair,
      stockBroken: current.stockBroken,
      stockMissing: nextMissing,
    });

    const updated = await prisma.item.update({
      where: { id: itemId },
      data: {
        stockMissing: nextMissing,
        stockTotal: nextTotal,
        availabilityStatus: nextStatus,
      },
    });
    return NextResponse.json({
      item: {
        id: updated.id,
        availabilityStatus: updated.availabilityStatus,
        stockTotal: updated.stockTotal,
        stockInRepair: updated.stockInRepair,
        stockBroken: updated.stockBroken,
        stockMissing: updated.stockMissing,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  }

  let fromRepair: number;
  let fromBroken: number;
  if (useSplit) {
    fromRepair = quantityFromRepair!;
    fromBroken = quantityFromBroken!;
    if (fromRepair + fromBroken < 1) {
      return NextResponse.json(
        { error: { message: "Сумма quantityFromRepair и quantityFromBroken должна быть не меньше 1." } },
        { status: 400 },
      );
    }
    if (fromRepair > current.stockInRepair || fromBroken > current.stockBroken) {
      return NextResponse.json(
        { error: { message: "Not enough broken/repair stock for the requested split." } },
        { status: 400 },
      );
    }
  } else {
    if (current.stockInRepair + current.stockBroken < quantity!) {
      return NextResponse.json(
        { error: { message: "Not enough broken/repair stock for this action." } },
        { status: 400 },
      );
    }
    fromRepair = Math.min(current.stockInRepair, quantity!);
    fromBroken = quantity! - fromRepair;
  }

  const totalRepairOrWriteOff = fromRepair + fromBroken;
  const updated = await prisma.$transaction(async (tx) => {
    const nextInRepair = current.stockInRepair - fromRepair;
    const nextBroken = current.stockBroken - fromBroken;
    const nextTotal = action === "WRITE_OFF" ? Math.max(0, current.stockTotal - totalRepairOrWriteOff) : current.stockTotal;
    const nextStatus = resolveAvailabilityStatusFromBuckets({
      currentStatus: current.availabilityStatus,
      stockTotal: nextTotal,
      stockInRepair: nextInRepair,
      stockBroken: nextBroken,
      stockMissing: current.stockMissing,
    });

    return tx.item.update({
      where: { id: itemId },
      data: {
        stockInRepair: nextInRepair,
        stockBroken: nextBroken,
        stockTotal: nextTotal,
        availabilityStatus: nextStatus,
      },
    });
  });

  return NextResponse.json({
    item: {
      id: updated.id,
      availabilityStatus: updated.availabilityStatus,
      stockTotal: updated.stockTotal,
      stockInRepair: updated.stockInRepair,
      stockBroken: updated.stockBroken,
      stockMissing: updated.stockMissing,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
