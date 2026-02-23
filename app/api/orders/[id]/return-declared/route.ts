import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { serializeOrder } from "@/lib/orders";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  if (auth.user.role !== Role.GREENWICH) {
    return fail(403, "Only Greenwich users can declare return.");
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { lines: { orderBy: [{ createdAt: "asc" }] } },
  });

  if (!order) {
    return fail(404, "Order not found.");
  }

  if (order.createdById !== auth.user.id) {
    return fail(403, "Forbidden.");
  }

  if (order.status === "RETURN_DECLARED") {
    return NextResponse.json({ order: serializeOrder(order) });
  }

  if (order.status !== "ISSUED") {
    return fail(409, "Return can be declared only for ISSUED orders.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "RETURN_DECLARED",
        returnDeclaredAt: new Date(),
      },
    });

    return tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { lines: { orderBy: [{ createdAt: "asc" }] } },
    });
  });

  return NextResponse.json({
    order: serializeOrder(updated),
  });
}
