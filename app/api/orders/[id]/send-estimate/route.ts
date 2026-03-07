import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { buildEstimateXlsx } from "@/lib/estimate-xlsx";
import {
  buildOrderSnapshot,
  type OrderEstimateSnapshot,
} from "@/lib/order-estimate-flow";
import { parseApproveInput, serializeOrder } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { sendTelegramDocument } from "@/lib/telegram-bot";
import { Prisma } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

/**
 * Склад отправляет смету гринвичу (заявка остаётся SUBMITTED).
 * Сохраняем approvedQty и цены на услуги, строим смету, отправляем, сохраняем снимок и сбрасываем подтверждение гринвича.
 */
export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid JSON body.");
  }

  const parsed = parseApproveInput(body);
  if (!parsed) return fail(400, "Invalid payload (lines, prices).");

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      createdBy: { select: { telegramId: true } },
      lines: {
        orderBy: [{ createdAt: "asc" }],
        include: { item: { select: { name: true } } },
      },
    },
  });

  if (!order) return fail(404, "Order not found.");
  if (order.status !== "SUBMITTED") {
    return fail(409, "Отправить смету можно только по заявке в статусе «На согласовании».");
  }

  const updateByLineId = new Map(parsed.lines.map((l) => [l.orderLineId, l.approvedQty]));
  if (updateByLineId.size !== order.lines.length) {
    return fail(400, "Payload must include approvedQty for every order line.");
  }
  for (const line of order.lines) {
    const qty = updateByLineId.get(line.id);
    if (qty === undefined) return fail(400, "Missing approvedQty for an order line.");
    if (qty > line.requestedQty) {
      return fail(400, "approvedQty cannot exceed requestedQty.", { orderLineId: line.id });
    }
  }

  if (order.deliveryRequested && (parsed.deliveryPrice == null || parsed.deliveryPrice < 0)) {
    return fail(400, "Укажите цену на доставку.");
  }
  if (order.mountRequested && (parsed.mountPrice == null || parsed.mountPrice < 0)) {
    return fail(400, "Укажите цену на монтаж.");
  }
  if (order.dismountRequested && (parsed.dismountPrice == null || parsed.dismountPrice < 0)) {
    return fail(400, "Укажите цену на демонтаж.");
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await Promise.all(
      order.lines.map((line) =>
        tx.orderLine.update({
          where: { id: line.id },
          data: { approvedQty: updateByLineId.get(line.id)! },
        }),
      ),
    );

    const composedNote = parsed.warehouseComment
      ? `${order.notes ? `${order.notes}\n` : ""}Комментарий склада: ${parsed.warehouseComment}`
      : order.notes;

    await tx.order.update({
      where: { id: order.id },
      data: {
        notes: composedNote ?? undefined,
        ...(order.deliveryRequested && parsed.deliveryPrice != null
          ? { deliveryPrice: new Prisma.Decimal(parsed.deliveryPrice) }
          : {}),
        ...(order.mountRequested && parsed.mountPrice != null
          ? { mountPrice: new Prisma.Decimal(parsed.mountPrice) }
          : {}),
        ...(order.dismountRequested && parsed.dismountPrice != null
          ? { dismountPrice: new Prisma.Decimal(parsed.dismountPrice) }
          : {}),
        estimateSentAt: now,
        estimateSentSnapshot: (() => {
          const synthetic = {
            lines: order.lines.map((l) => ({
              id: l.id,
              itemId: l.itemId,
              approvedQty: updateByLineId.get(l.id)!,
              sourceKitId: l.sourceKitId ?? null,
              item: l.item,
            })),
            deliveryPrice: parsed.deliveryPrice ?? null,
            mountPrice: parsed.mountPrice ?? null,
            dismountPrice: parsed.dismountPrice ?? null,
          };
          return buildOrderSnapshot(synthetic) as unknown as Prisma.InputJsonValue;
        })(),
        greenwichConfirmedAt: null,
        greenwichConfirmedSnapshot: Prisma.JsonNull,
      },
    });

    return tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: {
        customer: true,
        createdBy: { select: { telegramId: true } },
        lines: {
          orderBy: [{ createdAt: "asc" }],
          include: { item: { select: { name: true } } },
        },
      },
    });
  });

  const buffer = buildEstimateXlsx({
    orderId: updated.id,
    startDate: updated.startDate.toISOString().slice(0, 10),
    endDate: updated.endDate.toISOString().slice(0, 10),
    customerName: updated.customer?.name ?? null,
    eventName: updated.eventName ?? null,
    lines: updated.lines.map((line) => ({
      itemName: line.item.name,
      requestedQty: line.approvedQty ?? line.requestedQty,
      pricePerDay: Number(line.pricePerDaySnapshot),
    })),
    deliveryPrice: updated.deliveryPrice != null ? Number(updated.deliveryPrice) : null,
    mountPrice: updated.mountPrice != null ? Number(updated.mountPrice) : null,
    dismountPrice: updated.dismountPrice != null ? Number(updated.dismountPrice) : null,
    discountRate:
      updated.orderSource === "GREENWICH_INTERNAL" ? Number(updated.discountRate) : undefined,
  });

  const dateStr = now.toISOString().slice(0, 10);
  const customerPart = (updated.customer?.name ?? "bez_zakazchika")
    .replace(/[\s\\/:*?"<>|]/g, "_")
    .slice(0, 40)
    .trim() || "zakazchik";
  const userPart = (auth.user.username ?? `user_${auth.user.id}`)
    .replace(/[\s\\/:*?"<>|]/g, "_")
    .slice(0, 30)
    .trim() || "sotr";
  const filename = `smeta_${dateStr}_${customerPart}_${userPart}.xlsx`;
  const caption = `Смета по заявке ${updated.id}. Период: ${updated.startDate.toISOString().slice(0, 10)} — ${updated.endDate.toISOString().slice(0, 10)}. Подтвердите смету в разделе «Мои заявки» (кнопка «Подтвердить»).`;

  await sendTelegramDocument({
    chatId: updated.createdBy.telegramId.toString(),
    buffer,
    filename,
    caption,
  });

  const { notifyGreenwichEstimateSent, notifyGreenwichEstimateUpdated } = await import(
    "@/lib/notifications"
  );
  const wasConfirmed = order.greenwichConfirmedAt != null;
  if (wasConfirmed) {
    await notifyGreenwichEstimateUpdated({
      ownerTelegramId: updated.createdBy.telegramId.toString(),
      orderId: updated.id,
      startDate: updated.startDate.toISOString().slice(0, 10),
      endDate: updated.endDate.toISOString().slice(0, 10),
    });
  } else {
    await notifyGreenwichEstimateSent({
      ownerTelegramId: updated.createdBy.telegramId.toString(),
      orderId: updated.id,
      startDate: updated.startDate.toISOString().slice(0, 10),
      endDate: updated.endDate.toISOString().slice(0, 10),
    });
  }

  return NextResponse.json({ order: serializeOrder(updated) });
}
