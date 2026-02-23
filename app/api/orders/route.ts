import { Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getReservedQtyMap } from "@/lib/availability";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import {
  asPrismaDateInput,
  parseCreateOrderInput,
  serializeOrder,
  validateDateRange,
} from "@/lib/orders";
import { prisma } from "@/lib/prisma";

function normalizeLines(
  lines: Array<{ itemId: string; requestedQty: number; sourceKitId?: string | null }>,
): Array<{ itemId: string; requestedQty: number; sourceKitId: string | null }> {
  const merged = new Map<string, { itemId: string; requestedQty: number; sourceKitId: string | null }>();

  for (const line of lines) {
    const sourceKitId = line.sourceKitId ?? null;
    const key = `${line.itemId}::${sourceKitId ?? "-"}`;
    const existing = merged.get(key);
    if (existing) {
      existing.requestedQty += line.requestedQty;
    } else {
      merged.set(key, {
        itemId: line.itemId,
        requestedQty: line.requestedQty,
        sourceKitId,
      });
    }
  }

  return Array.from(merged.values());
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  if (auth.user.role !== Role.GREENWICH) {
    return fail(403, "Only Greenwich users can create orders.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid JSON body.");
  }

  const parsed = parseCreateOrderInput(body);
  if (!parsed) {
    return fail(400, "Invalid order payload.");
  }

  const parsedRange = validateDateRange(parsed.startDate, parsed.endDate);
  if (!parsedRange.ok) {
    return fail(400, parsedRange.message);
  }

  const normalizedLines = normalizeLines(parsed.lines);
  const itemIds = Array.from(new Set(normalizedLines.map((line) => line.itemId)));

  const items = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
      availabilityStatus: "ACTIVE",
    },
    select: {
      id: true,
      stockTotal: true,
      pricePerDay: true,
    },
  });

  if (items.length !== itemIds.length) {
    return fail(400, "Some items are missing or not available.");
  }

  const reservedMap = await getReservedQtyMap(
    itemIds,
    parsedRange.startDate,
    parsedRange.endDate,
  );

  const itemById = new Map(items.map((item) => [item.id, item]));
  for (const line of normalizedLines) {
    const item = itemById.get(line.itemId);
    if (!item) {
      return fail(400, "Some items are missing.");
    }
    const reservedQty = reservedMap.get(item.id) ?? 0;
    const availableQty = Math.max(0, item.stockTotal - reservedQty);
    if (line.requestedQty > availableQty) {
      return fail(400, "Requested quantity exceeds availability.", {
        itemId: item.id,
        requestedQty: line.requestedQty,
        availableQty,
      });
    }
  }

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        createdById: auth.user.id,
        status: "SUBMITTED",
        startDate: asPrismaDateInput(parsedRange.startDate),
        endDate: asPrismaDateInput(parsedRange.endDate),
        pickupTime: parsed.pickupTime ?? null,
        notes: parsed.notes ?? null,
        discountRate: new Prisma.Decimal(0.3),
        isEmergency: parsed.isEmergency === true,
      },
    });

    await tx.orderLine.createMany({
      data: normalizedLines.map((line) => {
        const item = itemById.get(line.itemId)!;
        return {
          orderId: created.id,
          itemId: line.itemId,
          requestedQty: line.requestedQty,
          approvedQty: null,
          issuedQty: null,
          sourceKitId: line.sourceKitId,
          pricePerDaySnapshot: new Prisma.Decimal(
            Number(item.pricePerDay) * 0.7,
          ),
        };
      }),
    });

    return tx.order.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        lines: {
          orderBy: [{ createdAt: "asc" }],
        },
      },
    });
  });

  return NextResponse.json({
    order: serializeOrder(order),
  });
}
