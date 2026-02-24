import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { resolveAvailabilityStatusFromBuckets } from "@/lib/item-status";
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
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) {
    return fail(404, "Item not found.");
  }

  const targetStatus = resolveAvailabilityStatusFromBuckets({
    currentStatus: item.availabilityStatus,
    stockInRepair: item.stockInRepair,
    stockBroken: item.stockBroken,
    stockMissing: item.stockMissing,
  });

  if (item.availabilityStatus === targetStatus) {
    return NextResponse.json({
      item: {
        id: item.id,
        availabilityStatus: targetStatus,
      },
    });
  }

  const updated = await prisma.item.update({
    where: { id: item.id },
    data: { availabilityStatus: targetStatus },
  });

  return NextResponse.json({
    item: {
      id: updated.id,
      availabilityStatus: updated.availabilityStatus,
    },
  });
}
