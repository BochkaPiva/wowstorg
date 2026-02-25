import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  if (auth.user.role !== Role.GREENWICH) {
    return fail(403, "Only Greenwich users can view this endpoint.");
  }

  const orders = await prisma.order.findMany({
    where: {
      createdById: auth.user.id,
    },
    include: {
      customer: true,
      lines: {
        include: {
          item: {
            select: {
              name: true,
            },
          },
        },
        orderBy: [{ createdAt: "asc" }],
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  function orderTotal(order: (typeof orders)[0]): number {
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
      startDate: order.startDate.toISOString().slice(0, 10),
      endDate: order.endDate.toISOString().slice(0, 10),
      customerName: order.customer?.name ?? null,
      eventName: order.eventName,
      orderSource: order.orderSource,
      notes: order.notes,
      totalAmount: orderTotal(order),
      updatedAt: order.updatedAt.toISOString(),
      deliveryRequested: order.deliveryRequested,
      deliveryComment: order.deliveryComment ?? null,
      mountRequested: order.mountRequested,
      mountComment: order.mountComment ?? null,
      dismountRequested: order.dismountRequested,
      dismountComment: order.dismountComment ?? null,
      lines: order.lines.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        itemName: line.item.name,
        requestedQty: line.requestedQty,
        approvedQty: line.approvedQty,
        issuedQty: line.issuedQty,
      })),
    })),
  });
}
