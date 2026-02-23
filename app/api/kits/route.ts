import { NextRequest, NextResponse } from "next/server";
import { getReservedQtyMap } from "@/lib/availability";
import { requireUser, isWarehouseSide } from "@/lib/api-auth";
import { parseDateRange } from "@/lib/date-range";
import { fail } from "@/lib/http";
import { computeAvailableQty, toDiscountedPrice } from "@/lib/items";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  const parsedDateRange = parseDateRange(
    request.nextUrl.searchParams.get("startDate"),
    request.nextUrl.searchParams.get("endDate"),
  );
  if (!parsedDateRange.ok) {
    return fail(400, parsedDateRange.message);
  }

  const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true";
  const canSeeInactiveItems = isWarehouseSide(auth.user.role) && includeInactive;

  const kits = await prisma.kit.findMany({
    where: {
      isActive: true,
    },
    orderBy: [{ name: "asc" }],
    include: {
      lines: {
        orderBy: [{ id: "asc" }],
        include: {
          item: {
            include: {
              categories: {
                include: {
                  category: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const itemIds = Array.from(
    new Set(
      kits.flatMap((kit) =>
        kit.lines
          .filter((line) => canSeeInactiveItems || line.item.availabilityStatus === "ACTIVE")
          .map((line) => line.itemId),
      ),
    ),
  );

  const reservedQtyMap = parsedDateRange.value
    ? await getReservedQtyMap(
        itemIds,
        parsedDateRange.value.startDate,
        parsedDateRange.value.endDate,
      )
    : new Map<string, number>();

  return NextResponse.json({
    kits: kits.map((kit) => ({
      id: kit.id,
      name: kit.name,
      description: kit.description,
      lines: kit.lines
        .filter((line) => canSeeInactiveItems || line.item.availabilityStatus === "ACTIVE")
        .map((line) => {
          const pricePerDay = Number(line.item.pricePerDay);
          const reservedQty = reservedQtyMap.get(line.item.id) ?? 0;

          return {
            id: line.id,
            defaultQty: line.defaultQty,
            item: {
              id: line.item.id,
              name: line.item.name,
              itemType: line.item.itemType,
              availabilityStatus: line.item.availabilityStatus,
              stockTotal: line.item.stockTotal,
              reservedQty,
              availableQty: computeAvailableQty(line.item, reservedQty),
              pricePerDay,
              pricePerDayDiscounted: toDiscountedPrice(pricePerDay),
              categories: line.item.categories.map((entry) => ({
                id: entry.category.id,
                name: entry.category.name,
              })),
            },
          };
        }),
    })),
  });
}
