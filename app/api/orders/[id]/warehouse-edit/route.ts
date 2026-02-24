import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getReservedQtyMap } from "@/lib/availability";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { computeAvailableQty } from "@/lib/items";
import { serializeOrder } from "@/lib/orders";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

type WarehouseEditLine = { itemId: string; requestedQty: number };

function parseLines(body: unknown): WarehouseEditLine[] | null {
  if (!body || typeof body !== "object") return null;
  const payload = body as Record<string, unknown>;
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) return null;

  const parsed: WarehouseEditLine[] = [];
  for (const raw of payload.lines) {
    if (!raw || typeof raw !== "object") return null;
    const line = raw as Record<string, unknown>;
    if (typeof line.itemId !== "string" || line.itemId.trim().length === 0) return null;
    if (typeof line.requestedQty !== "number" || !Number.isInteger(line.requestedQty) || line.requestedQty <= 0) {
      return null;
    }
    parsed.push({ itemId: line.itemId.trim(), requestedQty: line.requestedQty });
  }
  return parsed;
}

function mergeLines(lines: WarehouseEditLine[]): WarehouseEditLine[] {
  const map = new Map<string, number>();
  for (const line of lines) {
    map.set(line.itemId, (map.get(line.itemId) ?? 0) + line.requestedQty);
  }
  return Array.from(map.entries()).map(([itemId, requestedQty]) => ({ itemId, requestedQty }));
}

export async function PATCH(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  if (auth.user.role !== Role.WAREHOUSE && auth.user.role !== Role.ADMIN) {
    return fail(403, "Only warehouse/admin can edit order composition.");
  }

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { customer: true, lines: true },
  });
  if (!order) return fail(404, "Order not found.");
  if (order.status !== "SUBMITTED" && order.status !== "APPROVED") {
    return fail(409, "Состав заявки можно менять только в SUBMITTED или APPROVED.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid JSON body.");
  }
  const parsedLines = parseLines(body);
  if (!parsedLines) return fail(400, "Invalid lines payload.");
  const lines = mergeLines(parsedLines);

  const itemIds = Array.from(new Set(lines.map((line) => line.itemId)));
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
    return fail(400, "Некоторые позиции отсутствуют или недоступны.");
  }
  const itemById = new Map(items.map((item) => [item.id, item]));

  const reserved = await getReservedQtyMap(itemIds, order.startDate, order.endDate);
  for (const line of lines) {
    const item = itemById.get(line.itemId)!;
    const availableQty = computeAvailableQty(item, reserved.get(line.itemId) ?? 0);
    if (line.requestedQty > availableQty) {
      return fail(400, "Недостаточно доступного количества для позиции.", {
        itemId: line.itemId,
        requestedQty: line.requestedQty,
        availableQty,
      });
    }
  }

  const payload = body as Record<string, unknown>;
  const reason =
    typeof payload.reason === "string" && payload.reason.trim().length > 0 ? payload.reason.trim() : "";

  const updated = await prisma.$transaction(async (tx) => {
    await tx.orderLine.deleteMany({ where: { orderId: order.id } });
    await tx.orderLine.createMany({
      data: lines.map((line) => {
        const pricePerDay = Number(itemById.get(line.itemId)!.pricePerDay);
        const discountRate = Number(order.discountRate);
        return {
          orderId: order.id,
          itemId: line.itemId,
          requestedQty: line.requestedQty,
          approvedQty: null,
          issuedQty: null,
          sourceKitId: null,
          pricePerDaySnapshot: pricePerDay * (1 - discountRate),
        };
      }),
    });

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "SUBMITTED",
        approvedById: null,
        notes: reason.length > 0 ? `${order.notes ? `${order.notes}\n` : ""}Правка склада: ${reason}` : order.notes,
      },
    });

    return tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { customer: true, lines: { orderBy: [{ createdAt: "asc" }] } },
    });
  });

  return NextResponse.json({ order: serializeOrder(updated) });
}
