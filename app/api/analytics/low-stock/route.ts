import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireWarehouseUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const thresholdRaw = request.nextUrl.searchParams.get("threshold");
  const threshold = thresholdRaw ? Number(thresholdRaw) : 3;

  if (!Number.isFinite(threshold) || threshold < 0) {
    return fail(400, "Invalid threshold.");
  }

  const items = await prisma.item.findMany({
    where: {
      stockTotal: {
        lte: threshold,
      },
    },
    orderBy: [{ stockTotal: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      stockTotal: true,
      itemType: true,
      availabilityStatus: true,
      locationText: true,
    },
  });

  return NextResponse.json({
    threshold,
    items,
  });
}
