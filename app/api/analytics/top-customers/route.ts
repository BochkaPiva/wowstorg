import { OrderStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function parseDate(input: string | null): Date | null {
  if (!input) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return null;
  }
  const date = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateOnly(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const startDateRaw = request.nextUrl.searchParams.get("startDate");
  const endDateRaw = request.nextUrl.searchParams.get("endDate");
  const now = new Date();
  const defaultStartDate = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const defaultEndDate = toDateOnly(now);
  const startDate = startDateRaw ? parseDate(startDateRaw) : defaultStartDate;
  const endDate = endDateRaw ? parseDate(endDateRaw) : defaultEndDate;

  if ((startDateRaw && !startDate) || (endDateRaw && !endDate)) {
    return fail(400, "Invalid date format. Use YYYY-MM-DD.");
  }
  if (startDate && endDate && startDate > endDate) {
    return fail(400, "startDate must be less than or equal to endDate.");
  }

  const orders = await prisma.order.findMany({
    where: {
      status: {
        in: [OrderStatus.ISSUED, OrderStatus.RETURN_DECLARED, OrderStatus.CLOSED],
      },
      startDate: {
        gte: startDate ?? undefined,
      },
      endDate: {
        lte: endDate ?? undefined,
      },
      customerId: {
        not: null,
      },
    },
    include: {
      customer: true,
      lines: true,
    },
  });

  const totals = new Map<
    string,
    {
      customerId: string;
      customerName: string;
      ordersCount: number;
      revenue: number;
      sourceBreakdown: {
        greenwichInternal: number;
        wowstorgExternal: number;
      };
    }
  >();

  for (const order of orders) {
    if (!order.customer) {
      continue;
    }
    const days = Math.max(
      1,
      Math.ceil(
        (order.endDate.getTime() - order.startDate.getTime()) / (24 * 60 * 60 * 1000),
      ),
    );

    let orderRevenue = 0;
    for (const line of order.lines) {
      const qty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
      orderRevenue += qty * Number(line.pricePerDaySnapshot) * days;
    }

    const existing = totals.get(order.customerId!);
    if (existing) {
      existing.ordersCount += 1;
      existing.revenue += orderRevenue;
      if (order.orderSource === "GREENWICH_INTERNAL") {
        existing.sourceBreakdown.greenwichInternal += orderRevenue;
      } else {
        existing.sourceBreakdown.wowstorgExternal += orderRevenue;
      }
    } else {
      totals.set(order.customerId!, {
        customerId: order.customerId!,
        customerName: order.customer.name,
        ordersCount: 1,
        revenue: orderRevenue,
        sourceBreakdown: {
          greenwichInternal:
            order.orderSource === "GREENWICH_INTERNAL" ? orderRevenue : 0,
          wowstorgExternal:
            order.orderSource === "WOWSTORG_EXTERNAL" ? orderRevenue : 0,
        },
      });
    }
  }

  const topCustomers = Array.from(totals.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 100);

  return NextResponse.json({ topCustomers });
}
