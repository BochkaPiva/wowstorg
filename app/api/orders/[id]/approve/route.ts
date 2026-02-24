import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { parseApproveInput, serializeOrder } from "@/lib/orders";
import { notifyOrderOwner } from "@/lib/notifications";
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
      },
    });

    return tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { customer: true, lines: { orderBy: [{ createdAt: "asc" }] } },
    });
  });

  await notifyOrderOwner({
    ownerTelegramId: order.createdBy.telegramId.toString(),
    title: "Склад обработал заявку (этап согласования).",
    startDate: order.startDate.toISOString().slice(0, 10),
    endDate: order.endDate.toISOString().slice(0, 10),
    customerName: order.customer?.name ?? null,
    eventName: order.eventName,
    blocks: [
      {
        title: "Согласовано к выдаче",
        lines: order.lines
          .filter((line) => (updateByLineId.get(line.id) ?? 0) > 0)
          .map((line) => {
            const approvedQty = updateByLineId.get(line.id) ?? 0;
            return `${line.item.name}: ${approvedQty} из ${line.requestedQty}`;
          }),
      },
      {
        title: "Не удалось подтвердить полностью",
        lines: order.lines
          .filter((line) => (updateByLineId.get(line.id) ?? 0) < line.requestedQty)
          .map((line) => {
            const approvedQty = updateByLineId.get(line.id) ?? 0;
            const comment = commentByLineId.get(line.id);
            return `${line.item.name}: не хватает ${line.requestedQty - approvedQty}${comment ? ` (${comment})` : ""}`;
          }),
      },
    ],
    comment: parsed.warehouseComment ?? undefined,
  });

  return NextResponse.json({
    order: serializeOrder(updated),
  });
}
