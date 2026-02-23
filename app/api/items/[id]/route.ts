import { NextRequest, NextResponse } from "next/server";
import { getReservedQtyMap } from "@/lib/availability";
import { requireUser, isWarehouseSide } from "@/lib/api-auth";
import { parseDateRange } from "@/lib/date-range";
import { fail } from "@/lib/http";
import { computeAvailableQty, toDiscountedPrice } from "@/lib/items";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true";
  const canSeeInactive = isWarehouseSide(auth.user.role) && includeInactive;

  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      categories: {
        include: {
          category: true,
        },
      },
      images: {
        orderBy: [{ createdAt: "desc" }],
      },
    },
  });

  if (!item) {
    return fail(404, "Item not found.");
  }

  if (!canSeeInactive && item.availabilityStatus !== "ACTIVE") {
    return fail(404, "Item not found.");
  }

  const parsedDateRange = parseDateRange(
    request.nextUrl.searchParams.get("startDate"),
    request.nextUrl.searchParams.get("endDate"),
  );
  if (!parsedDateRange.ok) {
    return fail(400, parsedDateRange.message);
  }

  const reservedQtyMap = parsedDateRange.value
    ? await getReservedQtyMap([item.id], parsedDateRange.value.startDate, parsedDateRange.value.endDate)
    : new Map<string, number>();

  const pricePerDay = Number(item.pricePerDay);
  const reservedQty = reservedQtyMap.get(item.id) ?? 0;

  return NextResponse.json({
    item: {
      id: item.id,
      name: item.name,
      description: item.description,
      itemType: item.itemType,
      availabilityStatus: item.availabilityStatus,
      stockTotal: item.stockTotal,
      reservedQty,
      availableQty: computeAvailableQty(item, reservedQty),
      pricePerDay,
      pricePerDayDiscounted: toDiscountedPrice(pricePerDay),
      locationText: item.locationText,
      imageUrls: item.images.map((image) => image.url),
      categories: item.categories.map((entry) => ({
        id: entry.category.id,
        name: entry.category.name,
      })),
    },
  });
}
