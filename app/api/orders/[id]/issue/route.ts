import { ItemType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { parseIssueInput, serializeOrder } from "@/lib/orders";
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

  const parsed = parseIssueInput(body);
  if (!parsed) {
    return fail(400, "Invalid issue payload.");
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
        include: { item: true },
      },
    },
  });

  if (!order) {
    return fail(404, "Order not found.");
  }

  if (order.status !== "APPROVED" && order.status !== "ISSUED") {
    return fail(409, "Only APPROVED orders can be issued.");
  }

  const inputByLineId = new Map(parsed.lines.map((line) => [line.orderLineId, line.issuedQty]));
  if (inputByLineId.size !== order.lines.length) {
    return fail(400, "Payload must include issuedQty for every order line.");
  }

  for (const line of order.lines) {
    const issuedQty = inputByLineId.get(line.id);
    if (issuedQty === undefined) {
      return fail(400, "Missing issuedQty for an order line.");
    }
    const maxQty = line.approvedQty ?? line.requestedQty;
    if (issuedQty > maxQty) {
      return fail(400, "issuedQty cannot exceed approved/requested quantity.", {
        orderLineId: line.id,
      });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    await Promise.all(
      order.lines.map((line) =>
        tx.orderLine.update({
          where: { id: line.id },
          data: { issuedQty: inputByLineId.get(line.id)! },
        }),
      ),
    );

    const consumableDeltas = new Map<string, number>();
    for (const line of order.lines) {
      if (line.item.itemType !== ItemType.CONSUMABLE) {
        continue;
      }
      consumableDeltas.set(
        line.itemId,
        (consumableDeltas.get(line.itemId) ?? 0) + (inputByLineId.get(line.id) ?? 0),
      );
    }

    for (const [itemId, delta] of consumableDeltas) {
      const result = await tx.item.updateMany({
        where: {
          id: itemId,
          stockTotal: { gte: delta },
        },
        data: {
          stockTotal: { decrement: delta },
        },
      });
      if (result.count !== 1) {
        throw new Error("Insufficient consumable stock.");
      }
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "ISSUED",
        issuedById: auth.user.id,
        issuedAt: new Date(),
      },
    });

    return tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { customer: true, lines: { orderBy: [{ createdAt: "asc" }] } },
    });
  });

  await notifyOrderOwner({
    ownerTelegramId: order.createdBy.telegramId.toString(),
    title: "Заявка выдана.",
    startDate: order.startDate.toISOString().slice(0, 10),
    endDate: order.endDate.toISOString().slice(0, 10),
    customerName: order.customer?.name ?? null,
    eventName: order.eventName,
    blocks: [
      {
        title: "Подготовлено и выдано",
        lines: order.lines
          .filter((line) => (inputByLineId.get(line.id) ?? 0) > 0)
          .map((line) => {
            const issuedQty = inputByLineId.get(line.id) ?? 0;
            return `${line.item.name}: выдано ${issuedQty} (согласовано ${line.approvedQty ?? line.requestedQty})`;
          }),
      },
      {
        title: "Не выдано / выдано частично",
        lines: order.lines
          .filter((line) => (inputByLineId.get(line.id) ?? 0) < (line.approvedQty ?? line.requestedQty))
          .map((line) => {
            const issuedQty = inputByLineId.get(line.id) ?? 0;
            const approvedQty = line.approvedQty ?? line.requestedQty;
            return `${line.item.name}: выдано ${issuedQty} из ${approvedQty}`;
          }),
      },
    ],
    comment: order.notes ?? undefined,
  });

  return NextResponse.json({
    order: serializeOrder(updated),
  });
}
