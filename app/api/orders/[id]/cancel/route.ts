import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { serializeOrder } from "@/lib/orders";
import { notifyOrderOwner } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

const CANCELLABLE_BY_WAREHOUSE = ["SUBMITTED", "APPROVED"] as const;
const CANCELLABLE_BY_GREENWICH = ["SUBMITTED"] as const;

export async function POST(
  _request: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireUser(_request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      createdBy: { select: { telegramId: true } },
      lines: {
        orderBy: [{ createdAt: "asc" as const }],
      },
    },
  });

  if (!order) {
    return fail(404, "Order not found.");
  }

  const isWarehouse = auth.user.role === Role.WAREHOUSE || auth.user.role === Role.ADMIN;
  const isOwner = order.createdById === auth.user.id;

  if (isWarehouse) {
    if (!CANCELLABLE_BY_WAREHOUSE.includes(order.status as (typeof CANCELLABLE_BY_WAREHOUSE)[number])) {
      return fail(409, "Only new or approved orders can be cancelled by warehouse.");
    }
  } else if (isOwner && auth.user.role === Role.GREENWICH) {
    if (!CANCELLABLE_BY_GREENWICH.includes(order.status as (typeof CANCELLABLE_BY_GREENWICH)[number])) {
      return fail(409, "Only new (not yet approved) orders can be cancelled by creator.");
    }
  } else {
    return fail(403, "Forbidden.");
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { status: "CANCELLED" },
    include: {
      customer: true,
      lines: {
        orderBy: [{ createdAt: "asc" }],
      },
    },
  });

  const cancelledByWarehouse = auth.user.role === Role.WAREHOUSE || auth.user.role === Role.ADMIN;
  await notifyOrderOwner({
    ownerTelegramId: order.createdBy.telegramId.toString(),
    title: cancelledByWarehouse ? "Заявка отменена складом" : "Заявка отменена",
    startDate: order.startDate.toISOString().slice(0, 10),
    endDate: order.endDate.toISOString().slice(0, 10),
    customerName: order.customer?.name ?? null,
    eventName: order.eventName,
    blocks: [
      {
        title: cancelledByWarehouse ? "Склад отменил эту заявку." : "Вы отменили заявку.",
        lines: [`Заявка ${order.id} больше не активна.`],
      },
    ],
  });

  return NextResponse.json({
    order: serializeOrder(updated),
  });
}
