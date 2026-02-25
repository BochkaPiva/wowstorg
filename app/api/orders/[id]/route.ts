import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getReservedQtyMap } from "@/lib/availability";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import {
  asPrismaDateInput,
  parseDateOnlyOrNull,
  parsePatchOrderInput,
  serializeOrder,
  validateDateRange,
} from "@/lib/orders";
import { computeAvailableQty } from "@/lib/items";
import { notifyAdminsAboutOrderEdit } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

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

export async function GET(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: {
        include: {
          item: {
            select: {
              name: true,
            },
          },
        },
        orderBy: [{ createdAt: "asc" }],
      },
    },
  });

  if (!order) {
    return fail(404, "Order not found.");
  }

  const canView =
    auth.user.role === Role.ADMIN ||
    auth.user.role === Role.WAREHOUSE ||
    order.createdById === auth.user.id;
  if (!canView) {
    return fail(403, "Forbidden.");
  }

  return NextResponse.json({
    order: {
      ...serializeOrder(order),
      lines: order.lines.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        requestedQty: line.requestedQty,
        approvedQty: line.approvedQty,
        issuedQty: line.issuedQty,
        pricePerDaySnapshot: Number(line.pricePerDaySnapshot),
        sourceKitId: line.sourceKitId,
        item: {
          name: line.item.name,
        },
      })),
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  if (auth.user.role !== Role.GREENWICH) {
    return fail(403, "Only Greenwich users can edit orders.");
  }

  const { id } = await params;
  const existing = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: true,
    },
  });

  if (!existing) {
    return fail(404, "Order not found.");
  }

  if (existing.createdById !== auth.user.id) {
    return fail(403, "Forbidden.");
  }

  if (existing.status !== "SUBMITTED") {
    return fail(409, "Order can be edited only in SUBMITTED status.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid JSON body.");
  }

  const parsed = parsePatchOrderInput(body);
  if (!parsed) {
    return fail(400, "Invalid patch payload.");
  }

  const startDateRaw = parsed.startDate ?? existing.startDate.toISOString().slice(0, 10);
  const endDateRaw = parsed.endDate ?? existing.endDate.toISOString().slice(0, 10);
  const parsedRange = validateDateRange(startDateRaw, endDateRaw);
  let customerIdToUse = existing.customerId;
  if (parsed.customerId || parsed.customerName) {
    const customer = parsed.customerId
      ? await prisma.customer.findUnique({ where: { id: parsed.customerId } })
      : await prisma.customer.upsert({
          where: { name: parsed.customerName! },
          update: { isActive: true },
          create: { name: parsed.customerName!, isActive: true },
        });

    if (!customer || !customer.isActive) {
      return fail(400, "Customer is missing or inactive.");
    }
    customerIdToUse = customer.id;
  }

  if (!parsedRange.ok) {
    return fail(400, parsedRange.message);
  }

  const startDateForReadyBy = parsedRange.startDate;
  const readyByDateRaw =
    parsed.readyByDate ?? existing.readyByDate.toISOString().slice(0, 10);
  const readyByDate = parseDateOnlyOrNull(readyByDateRaw);
  if (!readyByDate || readyByDate > startDateForReadyBy) {
    return fail(400, "Дата готовности должна быть не позже даты начала аренды.");
  }

  if (parsed.lines) {
    const normalizedLines = normalizeLines(parsed.lines);
    const itemIds = Array.from(new Set(normalizedLines.map((line) => line.itemId)));
    const items = await prisma.item.findMany({
      where: { id: { in: itemIds }, availabilityStatus: { not: "RETIRED" } },
      select: {
        id: true,
        availabilityStatus: true,
        stockTotal: true,
        stockInRepair: true,
        stockBroken: true,
        stockMissing: true,
        pricePerDay: true,
      },
    });
    if (items.length !== itemIds.length) {
      return fail(400, "Some items are missing or not available.");
    }

    const itemById = new Map(items.map((item) => [item.id, item]));
    const reservedMap = await getReservedQtyMap(
      itemIds,
      parsedRange.startDate,
      parsedRange.endDate,
    );

    for (const line of normalizedLines) {
      const item = itemById.get(line.itemId)!;
      const reservedQty = reservedMap.get(item.id) ?? 0;
      const availableQty = computeAvailableQty(item, reservedQty);
      if (line.requestedQty > availableQty) {
        return fail(400, "Requested quantity exceeds availability.", {
          itemId: item.id,
          requestedQty: line.requestedQty,
          availableQty,
        });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: existing.id },
        data: {
          customerId: customerIdToUse ?? null,
          startDate: asPrismaDateInput(parsedRange.startDate),
          endDate: asPrismaDateInput(parsedRange.endDate),
          readyByDate: asPrismaDateInput(readyByDate),
          eventName: parsed.eventName !== undefined ? parsed.eventName : existing.eventName,
          pickupTime: parsed.pickupTime !== undefined ? parsed.pickupTime : existing.pickupTime,
          notes: parsed.notes !== undefined ? parsed.notes : existing.notes,
          deliveryRequested: parsed.deliveryRequested !== undefined ? parsed.deliveryRequested : existing.deliveryRequested,
          deliveryComment: parsed.deliveryComment !== undefined ? parsed.deliveryComment : existing.deliveryComment,
          mountRequested: parsed.mountRequested !== undefined ? parsed.mountRequested : existing.mountRequested,
          mountComment: parsed.mountComment !== undefined ? parsed.mountComment : existing.mountComment,
          dismountRequested: parsed.dismountRequested !== undefined ? parsed.dismountRequested : existing.dismountRequested,
          dismountComment: parsed.dismountComment !== undefined ? parsed.dismountComment : existing.dismountComment,
        },
      });

      await tx.orderLine.deleteMany({
        where: { orderId: existing.id },
      });

      await tx.orderLine.createMany({
        data: normalizedLines.map((line) => {
          const item = itemById.get(line.itemId)!;
          const discountRate = Number(existing.discountRate);
          return {
            orderId: existing.id,
            itemId: line.itemId,
            requestedQty: line.requestedQty,
            approvedQty: null,
            issuedQty: null,
            sourceKitId: line.sourceKitId,
            pricePerDaySnapshot: Number(item.pricePerDay) * (1 - discountRate),
          };
        }),
      });

      return tx.order.findUniqueOrThrow({
        where: { id: existing.id },
        include: {
          customer: true,
          lines: {
            orderBy: [{ createdAt: "asc" }],
            include: { item: { select: { name: true } } },
          },
        },
      });
    });

    const compositionSummary = updated.lines
      .map((l) => `${(l as { item: { name: string } }).item.name} x${l.requestedQty}`)
      .join(", ");
    await notifyAdminsAboutOrderEdit({
      orderId: existing.id,
      customerName: updated.customer?.name ?? null,
      startDate: updated.startDate.toISOString().slice(0, 10),
      endDate: updated.endDate.toISOString().slice(0, 10),
      compositionSummary,
    });

    return NextResponse.json({
      order: serializeOrder(updated),
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: existing.id },
      data: {
        customerId: customerIdToUse ?? null,
        startDate: asPrismaDateInput(parsedRange.startDate),
        endDate: asPrismaDateInput(parsedRange.endDate),
        readyByDate: asPrismaDateInput(readyByDate),
        eventName: parsed.eventName !== undefined ? parsed.eventName : existing.eventName,
        pickupTime: parsed.pickupTime !== undefined ? parsed.pickupTime : existing.pickupTime,
        notes: parsed.notes !== undefined ? parsed.notes : existing.notes,
        deliveryRequested: parsed.deliveryRequested !== undefined ? parsed.deliveryRequested : existing.deliveryRequested,
        deliveryComment: parsed.deliveryComment !== undefined ? parsed.deliveryComment : existing.deliveryComment,
        mountRequested: parsed.mountRequested !== undefined ? parsed.mountRequested : existing.mountRequested,
        mountComment: parsed.mountComment !== undefined ? parsed.mountComment : existing.mountComment,
        dismountRequested: parsed.dismountRequested !== undefined ? parsed.dismountRequested : existing.dismountRequested,
        dismountComment: parsed.dismountComment !== undefined ? parsed.dismountComment : existing.dismountComment,
      },
    });

    return tx.order.findUniqueOrThrow({
      where: { id: existing.id },
      include: {
        customer: true,
        lines: {
          orderBy: [{ createdAt: "asc" }],
          include: { item: { select: { name: true } } },
        },
      },
    });
  });

  const compositionSummary = updated.lines
    .map((l) => `${(l as { item: { name: string } }).item.name} x${l.requestedQty}`)
    .join(", ");
  await notifyAdminsAboutOrderEdit({
    orderId: existing.id,
    customerName: updated.customer?.name ?? null,
    startDate: updated.startDate.toISOString().slice(0, 10),
    endDate: updated.endDate.toISOString().slice(0, 10),
    compositionSummary,
  });

  return NextResponse.json({
    order: serializeOrder(updated),
  });
}
