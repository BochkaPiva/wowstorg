import { ItemType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import {
  parseCheckinInput,
  requiresCheckin,
  serializeOrder,
  toIncidentType,
} from "@/lib/orders";
import { notifyOrderOwner } from "@/lib/notifications";
import { resolveAvailabilityStatusFromBuckets } from "@/lib/item-status";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid JSON body.");
  }

  const parsed = parseCheckinInput(body);
  if (!parsed) {
    return fail(400, "Invalid check-in payload.");
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      createdBy: {
        select: {
          telegramId: true,
          username: true,
        },
      },
      lines: {
        include: {
          item: true,
        },
      },
    },
  });

  if (!order) {
    return fail(404, "Order not found.");
  }

  if (order.status === "CLOSED") {
    const closed = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { customer: true, lines: { orderBy: [{ createdAt: "asc" }] } },
    });
    return NextResponse.json({ order: serializeOrder(closed) });
  }

  if (order.status !== "RETURN_DECLARED" && order.status !== "ISSUED") {
    return fail(409, "Check-in is allowed only in RETURN_DECLARED or ISSUED status.");
  }

  const requiredLines = order.lines.filter((line) => requiresCheckin(line.item.itemType));
  const inputByLineId = new Map(parsed.lines.map((line) => [line.orderLineId, line]));

  for (const line of requiredLines) {
    if (!inputByLineId.has(line.id)) {
      return fail(400, "Missing check-in line for required order line.", {
        orderLineId: line.id,
      });
    }
  }

  for (const provided of parsed.lines) {
    const line = order.lines.find((entry) => entry.id === provided.orderLineId);
    if (!line) {
      return fail(400, "Unknown order line in check-in payload.", {
        orderLineId: provided.orderLineId,
      });
    }

    if (line.item.itemType === ItemType.CONSUMABLE) {
      return fail(400, "CONSUMABLE lines must not be included in check-in.");
    }

    const issuedQty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
    if (provided.returnedQty > issuedQty) {
      return fail(400, "returnedQty cannot exceed issued quantity.", {
        orderLineId: line.id,
      });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const itemDeltaById = new Map<
      string,
      { inRepair: number; broken: number; missing: number }
    >();

    for (const provided of parsed.lines) {
      const line = order.lines.find((entry) => entry.id === provided.orderLineId)!;
      const issuedQty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
      const missingAmount = Math.max(0, issuedQty - provided.returnedQty);

      const checkinLine = await tx.checkinLine.upsert({
        where: { orderLineId: line.id },
        update: {
          returnedQty: provided.returnedQty,
          condition: provided.condition,
          comment: provided.comment ?? null,
          createdById: auth.user.id,
        },
        create: {
          orderLineId: line.id,
          createdById: auth.user.id,
          returnedQty: provided.returnedQty,
          condition: provided.condition,
          comment: provided.comment ?? null,
        },
      });

      if (line.item.itemType !== ItemType.CONSUMABLE) {
        const entry = itemDeltaById.get(line.itemId) ?? { inRepair: 0, broken: 0, missing: 0 };
        if (provided.condition === "NEEDS_REPAIR") {
          entry.inRepair += provided.returnedQty;
        } else if (provided.condition === "BROKEN") {
          entry.broken += provided.returnedQty;
        } else if (provided.condition === "MISSING") {
          entry.missing += provided.returnedQty;
        }
        if (missingAmount > 0) {
          entry.missing += missingAmount;
        }
        itemDeltaById.set(line.itemId, entry);
      }

      if (missingAmount > 0) {
        await tx.lostItem.create({
          data: {
            itemId: line.itemId,
            orderId: order.id,
            orderLineId: line.id,
            checkinLineId: checkinLine.id,
            detectedById: auth.user.id,
            customerTelegramId: order.createdBy.telegramId.toString(),
            customerNameSnapshot:
              order.customer?.name ?? order.createdBy.username ?? order.createdBy.telegramId.toString(),
            eventNameSnapshot: order.eventName ?? null,
            lostQty: missingAmount,
            note: provided.comment ?? null,
          },
        });
      }

      const incidentType = toIncidentType(provided.condition);
      if (incidentType) {
        await tx.incident.create({
          data: {
            itemId: line.itemId,
            orderId: order.id,
            orderLineId: line.id,
            type: incidentType,
            description: provided.comment ?? null,
            createdById: auth.user.id,
          },
        });

      }
    }

    for (const [itemId, delta] of itemDeltaById) {
      const item = order.lines.find((line) => line.itemId === itemId)?.item;
      if (!item) {
        continue;
      }
      const nextStockInRepair = Math.max(0, item.stockInRepair + delta.inRepair);
      const nextStockBroken = Math.max(0, item.stockBroken + delta.broken);
      const nextStockMissing = Math.max(0, item.stockMissing + delta.missing);
      await tx.item.update({
        where: { id: itemId },
        data: {
          stockInRepair: nextStockInRepair,
          stockBroken: nextStockBroken,
          stockMissing: nextStockMissing,
          availabilityStatus: resolveAvailabilityStatusFromBuckets({
            currentStatus: item.availabilityStatus,
            stockInRepair: nextStockInRepair,
            stockBroken: nextStockBroken,
            stockMissing: nextStockMissing,
          }),
        },
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "CLOSED",
        returnDeclaredAt: order.returnDeclaredAt ?? new Date(),
        closedAt: new Date(),
      },
    });

    return tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { customer: true, lines: { orderBy: [{ createdAt: "asc" }] } },
    });
  });

  await notifyOrderOwner({
    ownerTelegramId: order.createdBy.telegramId.toString(),
    title: "Приемка по заявке завершена.",
    startDate: order.startDate.toISOString().slice(0, 10),
    endDate: order.endDate.toISOString().slice(0, 10),
    customerName: order.customer?.name ?? null,
    eventName: order.eventName,
    blocks: [
      {
        title: "Принято (ОК)",
        lines: order.lines
          .map((line) => ({ line, checked: inputByLineId.get(line.id) }))
          .filter((entry) => entry.checked?.condition === "OK")
          .map((entry) => {
            const issuedQty = entry.line.issuedQty ?? entry.line.approvedQty ?? entry.line.requestedQty;
            return `${entry.line.item.name}: ${entry.checked?.returnedQty ?? 0} из ${issuedQty}`;
          }),
      },
      {
        title: "Проблемы по позициям",
        lines: order.lines
          .map((line) => ({ line, checked: inputByLineId.get(line.id) }))
          .filter((entry) => entry.checked && entry.checked.condition !== "OK")
          .map((entry) => {
            const issuedQty = entry.line.issuedQty ?? entry.line.approvedQty ?? entry.line.requestedQty;
            return `${entry.line.item.name}: ${entry.checked?.returnedQty ?? 0} из ${issuedQty}, статус ${entry.checked?.condition}${
              entry.checked?.comment ? ` (${entry.checked.comment})` : ""
            }`;
          }),
      },
    ],
  });

  return NextResponse.json({
    order: serializeOrder(updated),
  });
}
