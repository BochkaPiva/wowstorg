import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { parseApproveInput, serializeOrder } from "@/lib/orders";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid JSON body.");
  }

  const parsed = parseApproveInput(body);
  if (!parsed) {
    return fail(400, "Invalid approve payload.");
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: { customer: true, lines: true },
  });

  if (!order) {
    return fail(404, "Order not found.");
  }

  if (order.status !== "SUBMITTED") {
    return fail(409, "Only SUBMITTED orders can be approved.");
  }

  const updateByLineId = new Map(parsed.lines.map((line) => [line.orderLineId, line.approvedQty]));
  if (updateByLineId.size !== order.lines.length) {
    return fail(400, "Payload must include approvedQty for every order line.");
  }

  for (const line of order.lines) {
    const approvedQty = updateByLineId.get(line.id);
    if (approvedQty === undefined) {
      return fail(400, "Missing approvedQty for an order line.");
    }
    if (approvedQty > line.requestedQty) {
      return fail(400, "approvedQty cannot exceed requestedQty.", {
        orderLineId: line.id,
      });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    await Promise.all(
      order.lines.map((line) =>
        tx.orderLine.update({
          where: { id: line.id },
          data: { approvedQty: updateByLineId.get(line.id)! },
        }),
      ),
    );

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "APPROVED",
        approvedById: auth.user.id,
      },
    });

    return tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { customer: true, lines: { orderBy: [{ createdAt: "asc" }] } },
    });
  });

  return NextResponse.json({
    order: serializeOrder(updated),
  });
}
