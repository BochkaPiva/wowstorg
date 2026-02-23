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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const startDateRaw = request.nextUrl.searchParams.get("startDate");
  const endDateRaw = request.nextUrl.searchParams.get("endDate");
  const startDate = parseDate(startDateRaw);
  const endDate = parseDate(endDateRaw);

  if ((startDateRaw && !startDate) || (endDateRaw && !endDate)) {
    return fail(400, "Invalid date format. Use YYYY-MM-DD.");
  }

  const lines = await prisma.orderLine.findMany({
    where: {
      order: {
        status: {
          in: [OrderStatus.ISSUED, OrderStatus.RETURN_DECLARED, OrderStatus.CLOSED],
        },
        startDate: {
          gte: startDate ?? undefined,
        },
        endDate: {
          lte: endDate ?? undefined,
        },
      },
    },
    include: {
      item: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const totals = new Map<string, { itemId: string; name: string; qty: number }>();
  for (const line of lines) {
    const qty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
    const existing = totals.get(line.itemId);
    if (existing) {
      existing.qty += qty;
    } else {
      totals.set(line.itemId, {
        itemId: line.itemId,
        name: line.item.name,
        qty,
      });
    }
  }

  const topItems = Array.from(totals.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 30);

  return NextResponse.json({ topItems });
}
