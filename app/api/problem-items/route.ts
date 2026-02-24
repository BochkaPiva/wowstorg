import { AvailabilityStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const items = await prisma.item.findMany({
    where: {
      availabilityStatus: {
        in: [
          AvailabilityStatus.NEEDS_REPAIR,
          AvailabilityStatus.BROKEN,
          AvailabilityStatus.MISSING,
          AvailabilityStatus.RETIRED,
        ],
      },
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
  if (action !== "REPAIR" && action !== "WRITE_OFF") {
    return NextResponse.json({ error: { message: "action must be REPAIR or WRITE_OFF." } }, { status: 400 });
  }
  const quantity =
    typeof payload.quantity === "number" && Number.isInteger(payload.quantity) && payload.quantity > 0
      ? payload.quantity
      : null;
  if (!quantity) {
    return NextResponse.json({ error: { message: "quantity must be positive integer." } }, { status: 400 });
  }

  const current = await prisma.item.findUnique({ where: { id: itemId } });
  if (!current) {
    return NextResponse.json({ error: { message: "Item not found." } }, { status: 404 });
  }
  if (current.stockInRepair + current.stockBroken < quantity) {
    return NextResponse.json(
      { error: { message: "Not enough broken/repair stock for this action." } },
      { status: 400 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const fromRepair = Math.min(current.stockInRepair, quantity);
    const fromBroken = quantity - fromRepair;
    const nextInRepair = current.stockInRepair - fromRepair;
    const nextBroken = current.stockBroken - fromBroken;
    const nextTotal = action === "WRITE_OFF" ? Math.max(0, current.stockTotal - quantity) : current.stockTotal;
    const nextStatus =
      current.availabilityStatus === AvailabilityStatus.RETIRED
        ? AvailabilityStatus.RETIRED
        : current.stockMissing > 0
          ? AvailabilityStatus.MISSING
          : nextBroken > 0
            ? AvailabilityStatus.BROKEN
            : nextInRepair > 0
              ? AvailabilityStatus.NEEDS_REPAIR
              : AvailabilityStatus.ACTIVE;

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
