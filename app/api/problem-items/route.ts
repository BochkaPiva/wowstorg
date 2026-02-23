import { AvailabilityStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const items = await prisma.item.findMany({
    where: {
      availabilityStatus: {
        in: [
          AvailabilityStatus.NEEDS_REPAIR,
          AvailabilityStatus.BROKEN,
          AvailabilityStatus.MISSING,
          AvailabilityStatus.RETIRED,
        ],
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      availabilityStatus: item.availabilityStatus,
      stockTotal: item.stockTotal,
      updatedAt: item.updatedAt.toISOString(),
      locationText: item.locationText,
    })),
  });
}
