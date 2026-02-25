import { ItemType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { checkinConditionLabel } from "@/lib/checkin-labels";
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

  const isExternalQuickReturn =
    order.status === "ISSUED" && order.orderSource === "WOWSTORG_EXTERNAL";
  if (order.status !== "RETURN_DECLARED" && !isExternalQuickReturn) {
    return fail(409, "Check-in is allowed only in RETURN_DECLARED or for быстрая выдача (ISSUED).");
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
    const issuedQty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
    if (provided.segments) {
      const sum = provided.segments.reduce((a, s) => a + s.qty, 0);
      if (sum !== issuedQty) {
        return fail(400, "Sum of segments must equal issued quantity.", {
          orderLineId: line.id,
          issuedQty,
          segmentsSum: sum,
        });
      }
    } else if (provided.returnedQty > issuedQty) {
      return fail(400, "returnedQty cannot exceed issued quantity.", {
        orderLineId: line.id,
      });
    }
  }

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
    const itemDeltaById = new Map<
      string,
      { inRepair: number; broken: number; missing: number }
    >();

    for (const provided of parsed.lines) {
      const line = order.lines.find((entry) => entry.id === provided.orderLineId)!;
      const issuedQty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
      const segments: Array<{ condition: "OK" | "NEEDS_REPAIR" | "BROKEN" | "MISSING"; qty: number }> = provided.segments
        ? provided.segments.filter((s) => s.qty > 0)
        : [
            { condition: provided.condition, qty: provided.returnedQty },
            ...(issuedQty - provided.returnedQty > 0
              ? [{ condition: "MISSING" as const, qty: issuedQty - provided.returnedQty }]
              : []),
          ].filter((s) => s.qty > 0);

      const okQty = segments.filter((s) => s.condition === "OK").reduce((a, s) => a + s.qty, 0);
      const displayCondition = segments.find((s) => s.condition !== "OK")?.condition ?? "OK";

      const checkinLine = await tx.checkinLine.upsert({
        where: { orderLineId: line.id },
        update: {
          returnedQty: okQty,
          condition: displayCondition,
          returnSegments: provided.segments ? (provided.segments as object) : undefined,
          comment: provided.comment ?? null,
          createdById: auth.user.id,
        },
        create: {
          orderLineId: line.id,
          createdById: auth.user.id,
          returnedQty: okQty,
          condition: displayCondition,
          returnSegments: provided.segments ? (provided.segments as object) : undefined,
          comment: provided.comment ?? null,
        },
      });

      if (line.item.itemType !== ItemType.CONSUMABLE) {
        const entry = itemDeltaById.get(line.itemId) ?? { inRepair: 0, broken: 0, missing: 0 };
        for (const seg of segments) {
          if (seg.condition === "NEEDS_REPAIR") entry.inRepair += seg.qty;
          else if (seg.condition === "BROKEN") entry.broken += seg.qty;
          else if (seg.condition === "MISSING") entry.missing += seg.qty;
        }
        itemDeltaById.set(line.itemId, entry);

        for (const seg of segments) {
          if (seg.condition === "MISSING" && seg.qty > 0) {
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
                lostQty: seg.qty,
                note: provided.comment ?? null,
              },
            });
          }
          const incidentType = toIncidentType(seg.condition);
          if (incidentType && seg.qty > 0) {
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
            stockTotal: item.stockTotal,
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
        warehouseInternalNote: null,
      },
    });

    return tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { customer: true, lines: { orderBy: [{ createdAt: "asc" }] } },
    });
  });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(500, `Ошибка при закрытии заявки: ${msg}`);
  }

  try {
    const okLines: string[] = [];
    const problemLines: string[] = [];
    for (const line of order.lines) {
      const checked = inputByLineId.get(line.id);
      if (!checked) continue;
      const issuedQty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
      const okQty = checked.segments
        ? checked.segments.filter((s) => s.condition === "OK").reduce((a, s) => a + s.qty, 0)
        : checked.condition === "OK"
          ? checked.returnedQty
          : 0;
      const problemSegments = checked.segments
        ? checked.segments.filter((s) => s.condition !== "OK")
        : (() => {
            const list: Array<{ condition: "OK" | "NEEDS_REPAIR" | "BROKEN" | "MISSING"; qty: number }> = [];
            if (checked.condition !== "OK" && checked.returnedQty > 0) {
              list.push({ condition: checked.condition, qty: checked.returnedQty });
            }
            const missing = issuedQty - checked.returnedQty;
            if (missing > 0) list.push({ condition: "MISSING" as const, qty: missing });
            return list;
          })();
      if (okQty > 0) {
        okLines.push(`${line.item.name}: ${okQty} из ${issuedQty}`);
      }
      for (const seg of problemSegments) {
        if (seg.qty > 0) {
          problemLines.push(
            `${line.item.name}: ${seg.qty} шт — ${checkinConditionLabel(seg.condition)}${checked.comment ? ` (${checked.comment})` : ""}`,
          );
        }
      }
    }
    await notifyOrderOwner({
      ownerTelegramId: order.createdBy.telegramId.toString(),
      title: "Приемка по заявке завершена.",
      startDate: order.startDate.toISOString().slice(0, 10),
      endDate: order.endDate.toISOString().slice(0, 10),
      customerName: order.customer?.name ?? null,
      eventName: order.eventName,
      blocks: [
        { title: "Принято (ОК)", lines: okLines },
        { title: "Проблемы по позициям", lines: problemLines },
      ],
    });
  } catch {
    // Уведомление не блокирует успех приёмки
  }

  return NextResponse.json({
    order: serializeOrder(updated),
  });
}
