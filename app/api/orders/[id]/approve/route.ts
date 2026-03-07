import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { buildEstimateXlsx } from "@/lib/estimate-xlsx";
import { orderStateEqualsSnapshot } from "@/lib/order-estimate-flow";
import {
  getNotificationChatConfig,
  sendDocumentToNotificationChat,
  notifyGreenwichOrderApprovedWithEstimate,
} from "@/lib/notifications";
import { parseApproveInput, serializeOrder } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { sendTelegramDocument } from "@/lib/telegram-bot";
import { Prisma, Role } from "@prisma/client";

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

  const parsed = parseApproveInput(body);
  if (!parsed) {
    return fail(400, "Invalid approve payload.");
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      createdBy: {
        select: {
          telegramId: true,
        },
      },
      lines: {
        include: {
          item: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    return fail(404, "Order not found.");
  }

  if (order.status !== "SUBMITTED") {
    return fail(409, "Only SUBMITTED orders can be approved.");
  }

  if (order.orderSource === "GREENWICH_INTERNAL") {
    if (!order.greenwichConfirmedAt) {
      return fail(
        409,
        "Сначала гринвич должен подтвердить смету. Отправьте смету (кнопка «Отправить смету») и дождитесь подтверждения.",
      );
    }
    const confirmedSnapshot =
      order.greenwichConfirmedSnapshot as import("@/lib/order-estimate-flow").OrderEstimateSnapshot | null;
    if (!orderStateEqualsSnapshot(order, confirmedSnapshot)) {
      return fail(
        400,
        "После подтверждения гринвича позиции или цены доп. услуг были изменены. Нажмите «Отправить смету» и дождитесь повторного подтверждения гринвича.",
      );
    }
  }

  const updateByLineId = new Map(parsed.lines.map((line) => [line.orderLineId, line.approvedQty]));
  const commentByLineId = new Map(parsed.lines.map((line) => [line.orderLineId, line.comment ?? null]));
  if (updateByLineId.size !== order.lines.length) {
    return fail(400, "Payload must include approvedQty for every order line.");
  }

  for (const line of order.lines) {
    const approvedQty = updateByLineId.get(line.id);
    if (approvedQty === undefined) {
      return fail(400, "Missing approvedQty for an order line.");
    }
    if (approvedQty > line.requestedQty) {
      return fail(400, "approvedQty cannot exceed requestedQty.", {
        orderLineId: line.id,
      });
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

  const updated = await prisma.$transaction(async (tx) => {
    await Promise.all(
      order.lines.map((line) =>
        tx.orderLine.update({
          where: { id: line.id },
          data: { approvedQty: updateByLineId.get(line.id)! },
        }),
      ),
    );

    const shortages = order.lines
      .map((line) => {
        const approvedQty = updateByLineId.get(line.id) ?? 0;
        if (approvedQty >= line.requestedQty) {
          return null;
        }
        return {
          itemId: line.itemId,
          requestedQty: line.requestedQty,
          approvedQty,
          comment: commentByLineId.get(line.id),
        };
      })
      .filter((entry) => entry !== null);

    const shortageText =
      shortages.length > 0
        ? shortages
            .map(
              (entry) =>
                `${entry.itemId}: запрошено ${entry.requestedQty}, подтверждено ${entry.approvedQty}${
                  entry.comment ? ` (${entry.comment})` : ""
                }`,
            )
            .join("; ")
        : "";

    const composedNote = [
      parsed.warehouseComment ? `Комментарий склада: ${parsed.warehouseComment}` : "",
      shortageText ? `Недостача по позициям: ${shortageText}` : "",
    ]
      .filter((entry) => entry.length > 0)
      .join("\n");

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "APPROVED",
        approvedById: auth.user.id,
        notes:
          composedNote.length > 0
            ? `${order.notes ? `${order.notes}\n` : ""}${composedNote}`
            : order.notes,
        ...(order.deliveryRequested && parsed.deliveryPrice != null
          ? { deliveryPrice: new Prisma.Decimal(parsed.deliveryPrice) }
          : {}),
        ...(order.mountRequested && parsed.mountPrice != null
          ? { mountPrice: new Prisma.Decimal(parsed.mountPrice) }
          : {}),
        ...(order.dismountRequested && parsed.dismountPrice != null
          ? { dismountPrice: new Prisma.Decimal(parsed.dismountPrice) }
          : {}),
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

  {
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
    const approvedAt = updated.updatedAt;
    const dateStr = approvedAt.toISOString().slice(0, 10);
    const customerPart = (updated.customer?.name ?? "bez_zakazchika")
      .replace(/[\s\\/:*?"<>|]/g, "_")
      .slice(0, 40)
      .trim() || "zakazchik";
    const userPart = (auth.user.username ?? `user_${auth.user.id}`)
      .replace(/[\s\\/:*?"<>|]/g, "_")
      .slice(0, 30)
      .trim() || "sotr";
    const filename = `smeta_${dateStr}_${customerPart}_${userPart}.xlsx`;
    const caption = `Заявка ${updated.id} согласована и укомплектована. Итоговая смета во вложении. Период: ${updated.startDate.toISOString().slice(0, 10)} — ${updated.endDate.toISOString().slice(0, 10)}.`;
    await sendTelegramDocument({
      chatId: updated.createdBy.telegramId.toString(),
      buffer,
      filename,
      caption,
    });
    const notificationChat = getNotificationChatConfig();
    if (notificationChat) {
      await sendDocumentToNotificationChat({ buffer, filename, caption });
    } else {
      const admins = await prisma.user.findMany({
        where: { role: Role.ADMIN },
        select: { telegramId: true },
      });
      const ownerId = updated.createdBy.telegramId.toString();
      await Promise.allSettled(
        admins
          .filter((a) => a.telegramId.toString() !== ownerId)
          .map((chatId) =>
            sendTelegramDocument({ chatId: chatId.telegramId.toString(), buffer, filename, caption }),
          ),
      );
    }
  }

  await notifyGreenwichOrderApprovedWithEstimate({
    ownerTelegramId: updated.createdBy.telegramId.toString(),
    orderId: updated.id,
    startDate: updated.startDate.toISOString().slice(0, 10),
    endDate: updated.endDate.toISOString().slice(0, 10),
  });

  return NextResponse.json({
    order: serializeOrder(updated),
  });
}
