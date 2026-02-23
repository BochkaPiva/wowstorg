import { ItemType, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getReservedQtyMap } from "@/lib/availability";
import { requireUser, isWarehouseSide } from "@/lib/api-auth";
import { parseDateRange } from "@/lib/date-range";
import { fail } from "@/lib/http";
import { computeAvailableQty, toDiscountedPrice } from "@/lib/items";
import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const params = request.nextUrl.searchParams;
  const parsedDateRange = parseDateRange(
    params.get("startDate"),
    params.get("endDate"),
  );
  if (!parsedDateRange.ok) {
    return fail(400, parsedDateRange.message);
  }

  const search = params.get("search")?.trim();
  const categoryId = params.get("categoryId")?.trim();
  const itemTypeRaw = params.get("itemType")?.trim();
  const includeInactive = params.get("includeInactive") === "true";
  const requestedLimit = Number(params.get("limit"));
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(1, requestedLimit), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const where: Prisma.ItemWhereInput = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { locationText: { contains: search, mode: "insensitive" } },
    ];
  }

  if (categoryId) {
    where.categories = {
      some: {
        categoryId,
      },
    };
  }

  if (itemTypeRaw) {
    if (!Object.values(ItemType).includes(itemTypeRaw as ItemType)) {
      return fail(400, "Invalid itemType filter.");
    }
    where.itemType = itemTypeRaw as ItemType;
  }

  const canSeeInactive = isWarehouseSide(auth.user.role) && includeInactive;
  if (!canSeeInactive) {
    where.availabilityStatus = "ACTIVE";
  }

  const items = await prisma.item.findMany({
    where,
    take: limit,
    orderBy: [{ name: "asc" }],
    include: {
      categories: {
        include: {
          category: true,
        },
      },
    },
  });

  const itemIds = items.map((item) => item.id);
  const reservedQtyMap = parsedDateRange.value
    ? await getReservedQtyMap(
        itemIds,
        parsedDateRange.value.startDate,
        parsedDateRange.value.endDate,
      )
    : new Map<string, number>();

  return NextResponse.json({
    items: items.map((item) => {
      const pricePerDay = Number(item.pricePerDay);
      const reservedQty = reservedQtyMap.get(item.id) ?? 0;

      return {
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
        categories: item.categories.map((entry) => ({
          id: entry.category.id,
          name: entry.category.name,
        })),
      };
    }),
  });
}
