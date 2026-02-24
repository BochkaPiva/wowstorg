import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const rows = await prisma.order.findMany({
    where: {
      status: { in: ["ISSUED", "RETURN_DECLARED"] },
    },
    include: {
      customer: { select: { name: true } },
      lines: {
        include: {
          item: { select: { id: true, name: true, itemType: true } },
        },
      },
    },
    orderBy: [{ endDate: "asc" }],
  });

  const rentedRows = rows.flatMap((order) =>
    order.lines
      .filter((line) => (line.issuedQty ?? line.approvedQty ?? line.requestedQty) > 0)
      .map((line) => ({
        orderId: order.id,
        itemId: line.item.id,
        itemName: line.item.name,
        itemType: line.item.itemType,
        qty: line.issuedQty ?? line.approvedQty ?? line.requestedQty,
        startDate: order.startDate.toISOString().slice(0, 10),
        endDate: order.endDate.toISOString().slice(0, 10),
        customerName: order.customer?.name ?? "Без заказчика",
      })),
  );

  return NextResponse.json({ rows: rentedRows });
}
