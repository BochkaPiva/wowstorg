import { OrderSource, OrderStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { parseDateRange } from "@/lib/date-range";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const ARCHIVE_STATUSES: OrderStatus[] = [
  OrderStatus.CLOSED,
  OrderStatus.CANCELLED,
];

function parseStatus(raw: string | null): OrderStatus | null {
  if (!raw || raw === "ALL") {
    return null;
  }
  return raw === OrderStatus.CLOSED || raw === OrderStatus.CANCELLED ? raw : null;
}

function parseSource(raw: string | null): OrderSource | null {
  if (!raw || raw === "ALL") {
    return null;
  }
  return raw === OrderSource.GREENWICH_INTERNAL || raw === OrderSource.WOWSTORG_EXTERNAL
    ? raw
    : null;
}

function escapeCsv(value: string | number | null): string {
  if (value === null) {
    return "";
  }
  const asText = String(value);
  if (/[",\n]/.test(asText)) {
    return `"${asText.replace(/"/g, '""')}"`;
  }
  return asText;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const statusRaw = request.nextUrl.searchParams.get("status");
  const sourceRaw = request.nextUrl.searchParams.get("source");
  const customerId = request.nextUrl.searchParams.get("customerId")?.trim() ?? "";
  const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
  const format = request.nextUrl.searchParams.get("format")?.trim() ?? "json";

  const status = parseStatus(statusRaw);
  if (statusRaw && statusRaw !== "ALL" && !status) {
    return fail(400, "Invalid status filter.");
  }

  const source = parseSource(sourceRaw);
  if (sourceRaw && sourceRaw !== "ALL" && !source) {
    return fail(400, "Invalid source filter.");
  }

  const dateRange = parseDateRange(
    request.nextUrl.searchParams.get("startDate"),
    request.nextUrl.searchParams.get("endDate"),
  );
  if (!dateRange.ok) {
    return fail(400, dateRange.message);
  }

  const orders = await prisma.order.findMany({
    where: {
      status: status ? status : { in: ARCHIVE_STATUSES },
      orderSource: source ?? undefined,
      customerId: customerId.length > 0 ? customerId : undefined,
      OR:
        search.length > 0
          ? [
              { id: { contains: search, mode: "insensitive" } },
              { eventName: { contains: search, mode: "insensitive" } },
              { notes: { contains: search, mode: "insensitive" } },
              {
                customer: {
                  name: { contains: search, mode: "insensitive" },
                },
              },
            ]
          : undefined,
      startDate: dateRange.value ? { gte: dateRange.value.startDate } : undefined,
      endDate: dateRange.value ? { lte: dateRange.value.endDate } : undefined,
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
        },
      },
      createdBy: {
        select: {
          username: true,
          telegramId: true,
        },
      },
      lines: {
        include: {
          item: {
            select: {
              itemType: true,
            },
          },
        },
        orderBy: [{ createdAt: "asc" }],
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 500,
  });

  if (format === "csv") {
    const header = [
      "orderId",
      "status",
      "source",
      "customerName",
      "eventName",
      "startDate",
      "endDate",
      "lineItemId",
      "lineItemType",
      "requestedQty",
      "approvedQty",
      "issuedQty",
      "updatedAt",
    ].join(",");

    const rows = orders.flatMap((order) => {
      if (order.lines.length === 0) {
        return [
          [
            order.id,
            order.status,
            order.orderSource,
            order.customer?.name ?? null,
            order.eventName,
            order.startDate.toISOString().slice(0, 10),
            order.endDate.toISOString().slice(0, 10),
            null,
            null,
            null,
            null,
            null,
            order.updatedAt.toISOString(),
          ]
            .map(escapeCsv)
            .join(","),
        ];
      }

      return order.lines.map((line) =>
        [
          order.id,
          order.status,
          order.orderSource,
          order.customer?.name ?? null,
          order.eventName,
          order.startDate.toISOString().slice(0, 10),
          order.endDate.toISOString().slice(0, 10),
          line.itemId,
          line.item.itemType,
          line.requestedQty,
          line.approvedQty,
          line.issuedQty,
          order.updatedAt.toISOString(),
        ]
          .map(escapeCsv)
          .join(","),
      );
    });

    return new NextResponse([header, ...rows].join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"warehouse-archive.csv\"",
      },
    });
  }

  function orderTotal(
    order: (typeof orders)[0],
  ): number {
    const days = Math.max(
      1,
      Math.ceil(
        (order.endDate.getTime() - order.startDate.getTime()) / (24 * 60 * 60 * 1000),
      ),
    );
    let sum = 0;
    for (const line of order.lines) {
      const qty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
      sum += qty * Number(line.pricePerDaySnapshot) * days;
    }
    if (order.orderSource === "GREENWICH_INTERNAL") {
      sum *= 1 - Number(order.discountRate);
    }
    return Math.round(sum);
  }

  return NextResponse.json({
    orders: orders.map((order) => ({
      id: order.id,
      status: order.status,
      orderSource: order.orderSource,
      customerId: order.customerId,
      customerName: order.customer?.name ?? null,
      eventName: order.eventName,
      startDate: order.startDate.toISOString().slice(0, 10),
      endDate: order.endDate.toISOString().slice(0, 10),
      notes: order.notes,
      totalAmount: orderTotal(order),
      createdBy: {
        username: order.createdBy.username,
        telegramId: order.createdBy.telegramId.toString(),
      },
      updatedAt: order.updatedAt.toISOString(),
      closedAt: order.closedAt?.toISOString() ?? null,
      lines: order.lines.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        itemType: line.item.itemType,
        requestedQty: line.requestedQty,
        approvedQty: line.approvedQty,
        issuedQty: line.issuedQty,
      })),
    })),
  });
}
