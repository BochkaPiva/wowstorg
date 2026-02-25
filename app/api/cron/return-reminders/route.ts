import { OrderStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getTodayMoscow,
  notifyOwnerLastDayOfRental,
  notifyOwnerOverdueReturn,
} from "@/lib/notifications";

function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Cron not configured (CRON_SECRET missing)." },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const querySecret = request.nextUrl.searchParams.get("secret");
  const provided = bearer ?? querySecret;
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = getTodayMoscow();

  const issued = await prisma.order.findMany({
    where: { status: OrderStatus.ISSUED },
    select: {
      id: true,
      endDate: true,
      customerId: true,
      customer: { select: { name: true } },
      eventName: true,
      createdBy: { select: { telegramId: true } },
    },
  });

  let lastDayCount = 0;
  let overdueCount = 0;

  for (const order of issued) {
    const endStr = order.endDate.toISOString().slice(0, 10);
    const telegramId = order.createdBy.telegramId?.toString();
    if (!telegramId) continue;

    if (endStr === today) {
      await notifyOwnerLastDayOfRental({
        ownerTelegramId: telegramId,
        orderId: order.id,
        endDate: endStr,
        customerName: order.customer?.name ?? null,
        eventName: order.eventName,
      });
      lastDayCount += 1;
    } else if (endStr < today) {
      const end = parseDate(endStr);
      const todayDate = parseDate(today);
      const daysOverdue = Math.floor(
        (todayDate.getTime() - end.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (daysOverdue >= 1) {
        await notifyOwnerOverdueReturn({
          ownerTelegramId: telegramId,
          orderId: order.id,
          endDate: endStr,
          customerName: order.customer?.name ?? null,
          eventName: order.eventName,
          daysOverdue,
        });
        overdueCount += 1;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    today,
    lastDayReminders: lastDayCount,
    overdueReminders: overdueCount,
  });
}
