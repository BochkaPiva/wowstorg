import { ItemType, OrderSource, Prisma, Role } from "@prisma/client";
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
import { notifyWarehouseAboutNewOrder } from "@/lib/notifications";
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

  if (
    auth.user.role !== Role.GREENWICH &&
    auth.user.role !== Role.WAREHOUSE &&
    auth.user.role !== Role.ADMIN
  ) {
    return fail(403, "Forbidden.");
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

  const isGreenwich = auth.user.role === Role.GREENWICH;
  const orderSource = isGreenwich
    ? OrderSource.GREENWICH_INTERNAL
    : (parsed.orderSource ?? OrderSource.WOWSTORG_EXTERNAL);
  const issueImmediately =
    isGreenwich ? false : parsed.issueImmediately !== false;

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
      itemType: true,
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

  const customer = parsed.customerId
    ? await prisma.customer.findUnique({
        where: { id: parsed.customerId },
      })
    : await prisma.customer.upsert({
        where: { name: parsed.customerName! },
        update: { isActive: true },
        create: {
          name: parsed.customerName!,
          isActive: true,
        },
      });

  if (!customer || !customer.isActive) {
    return fail(400, "Customer is missing or inactive.");
  }

  const order = await prisma.$transaction(async (tx) => {
    const status = issueImmediately ? "ISSUED" : "SUBMITTED";
    const created = await tx.order.create({
      data: {
        createdById: auth.user.id,
        customerId: customer.id,
        status,
        orderSource,
        startDate: asPrismaDateInput(parsedRange.startDate),
        endDate: asPrismaDateInput(parsedRange.endDate),
        eventName: parsed.eventName ?? null,
        pickupTime: parsed.pickupTime ?? null,
        notes: parsed.notes ?? null,
        discountRate: new Prisma.Decimal(0.3),
        isEmergency: parsed.isEmergency === true,
        approvedById: issueImmediately ? auth.user.id : null,
        issuedById: issueImmediately ? auth.user.id : null,
        issuedAt: issueImmediately ? new Date() : null,
      },
    });

    await tx.orderLine.createMany({
      data: normalizedLines.map((line) => {
        const item = itemById.get(line.itemId)!;
        const discountedPrice = Number(item.pricePerDay) * 0.7;
        return {
          orderId: created.id,
          itemId: line.itemId,
          requestedQty: line.requestedQty,
          approvedQty: issueImmediately ? line.requestedQty : null,
          issuedQty: issueImmediately ? line.requestedQty : null,
          sourceKitId: line.sourceKitId,
          pricePerDaySnapshot: new Prisma.Decimal(discountedPrice),
        };
      }),
    });

    if (issueImmediately) {
      const consumableDeltas = new Map<string, number>();
      for (const line of normalizedLines) {
        const item = itemById.get(line.itemId)!;
        if (item.itemType !== ItemType.CONSUMABLE) {
          continue;
        }
        consumableDeltas.set(
          line.itemId,
          (consumableDeltas.get(line.itemId) ?? 0) + line.requestedQty,
        );
      }

      for (const [itemId, delta] of consumableDeltas) {
        const result = await tx.item.updateMany({
          where: { id: itemId, stockTotal: { gte: delta } },
          data: {
            stockTotal: { decrement: delta },
          },
        });
        if (result.count !== 1) {
          throw new Error("Insufficient consumable stock.");
        }
      }
    }

    return tx.order.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        customer: true,
        lines: {
          orderBy: [{ createdAt: "asc" }],
        },
      },
    });
  });

  const serialized = serializeOrder(order);
  if (serialized.status === "SUBMITTED") {
    await notifyWarehouseAboutNewOrder({
      orderId: String(serialized.id),
      customerName: (serialized.customerName as string | null) ?? null,
      startDate: String(serialized.startDate),
      endDate: String(serialized.endDate),
    });
  }

  return NextResponse.json({
    order: serialized,
  });
}
