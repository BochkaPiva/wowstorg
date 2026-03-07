import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import {
  buildEstimateConfirmDiff,
  buildOrderSnapshot,
  formatEstimateConfirmDiffForWarehouse,
  type OrderEstimateSnapshot,
} from "@/lib/order-estimate-flow";
import { serializeOrder } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { notifyWarehouseGreenwichConfirmed } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> };

/**
 * Гринвич подтверждает смету. Только владелец заявки (createdBy).
 * Заявка должна быть SUBMITTED и по ней должна быть отправлена смета (estimateSentAt).
 * Сохраняем снимок текущего состояния как подтверждённый; уведомляем склад с диффом (было → стало).
 */
export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      createdBy: { select: { id: true, telegramId: true } },
      lines: {
        orderBy: [{ createdAt: "asc" }],
        include: { item: { select: { name: true } } },
      },
    },
  });

  if (!order) return fail(404, "Order not found.");
  if (order.createdById !== auth.user.id) {
    return fail(403, "Подтвердить смету может только автор заявки.");
  }
  if (order.status !== "SUBMITTED") {
    return fail(409, "Подтвердить смету можно только по заявке в статусе «На согласовании».");
  }
  if (!order.estimateSentAt) {
    return fail(409, "Сначала склад должен отправить смету по заявке.");
  }

  const confirmedSnapshot = buildOrderSnapshot(order);
  const estimateSnapshot = order.estimateSentSnapshot as OrderEstimateSnapshot | null;
  const diff = buildEstimateConfirmDiff(estimateSnapshot, confirmedSnapshot);
  const diffText = formatEstimateConfirmDiffForWarehouse(diff);

  await prisma.order.update({
    where: { id: order.id },
    data: {
      greenwichConfirmedAt: new Date(),
      greenwichConfirmedSnapshot: confirmedSnapshot as unknown as object,
    },
  });

  await notifyWarehouseGreenwichConfirmed({ orderId: order.id, diffText });

  const updated = await prisma.order.findUniqueOrThrow({
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

  return NextResponse.json({ order: serializeOrder(updated) });
}
