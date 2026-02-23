import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { serializeOrder } from "@/lib/orders";
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
        orderBy: [{ createdAt: "asc" }],
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json({
    orders: orders.map((order) => serializeOrder(order)),
  });
}
