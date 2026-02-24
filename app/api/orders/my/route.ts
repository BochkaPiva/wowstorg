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
      updatedAt: order.updatedAt.toISOString(),
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
