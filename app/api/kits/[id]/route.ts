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
  const parsedDateRange = parseDateRange(
    request.nextUrl.searchParams.get("startDate"),
    request.nextUrl.searchParams.get("endDate"),
  );
  if (!parsedDateRange.ok) {
    return fail(400, parsedDateRange.message);
  }

  const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true";
  const canSeeInactiveItems = isWarehouseSide(auth.user.role) && includeInactive;

  const kit = await prisma.kit.findUnique({
    where: { id },
    include: {
      lines: {
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

  if (!kit || !kit.isActive) {
    return fail(404, "Kit not found.");
  }

  const visibleLines = kit.lines.filter(
    (line) => canSeeInactiveItems || line.item.availabilityStatus === "ACTIVE",
  );

  const reservedQtyMap = parsedDateRange.value
    ? await getReservedQtyMap(
        visibleLines.map((line) => line.itemId),
        parsedDateRange.value.startDate,
        parsedDateRange.value.endDate,
      )
    : new Map<string, number>();

  return NextResponse.json({
    kit: {
      id: kit.id,
      name: kit.name,
      description: kit.description,
      coverImageUrl: kit.coverImageUrl,
      lines: visibleLines.map((line) => {
        const pricePerDay = Number(line.item.pricePerDay);
        const reservedQty = reservedQtyMap.get(line.item.id) ?? 0;

        return {
          id: line.id,
          defaultQty: line.defaultQty,
          item: {
            id: line.item.id,
            name: line.item.name,
            description: line.item.description,
            itemType: line.item.itemType,
            availabilityStatus: line.item.availabilityStatus,
            stockTotal: line.item.stockTotal,
            reservedQty,
            availableQty: computeAvailableQty(line.item, reservedQty),
            pricePerDay,
            pricePerDayDiscounted: toDiscountedPrice(pricePerDay),
            locationText: line.item.locationText,
            categories: line.item.categories.map((entry) => ({
              id: entry.category.id,
              name: entry.category.name,
            })),
          },
        };
      }),
    },
  });
}
