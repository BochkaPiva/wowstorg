import { AvailabilityStatus, ItemType, Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isWarehouseSide, requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function canManageCatalog(role: Role): boolean {
  return isWarehouseSide(role);
}

function parseItemType(raw: unknown): ItemType | null {
  return raw === ItemType.ASSET || raw === ItemType.BULK || raw === ItemType.CONSUMABLE
    ? raw
    : null;
}

function parseAvailabilityStatus(raw: unknown): AvailabilityStatus | null {
  return raw === AvailabilityStatus.ACTIVE ||
    raw === AvailabilityStatus.NEEDS_REPAIR ||
    raw === AvailabilityStatus.BROKEN ||
    raw === AvailabilityStatus.MISSING ||
    raw === AvailabilityStatus.RETIRED
    ? raw
    : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }
  if (!canManageCatalog(auth.user.role)) {
    return fail(403, "Only warehouse/admin can manage catalog.");
  }

  const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
  const items = await prisma.item.findMany({
    where:
      search.length > 0
        ? {
            OR: [
              { id: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          }
        : undefined,
    include: {
      categories: true,
      images: { orderBy: [{ createdAt: "desc" }] },
    },
    orderBy: [{ name: "asc" }],
    take: 300,
  });

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      itemType: item.itemType,
      availabilityStatus: item.availabilityStatus,
      stockTotal: item.stockTotal,
      stockInRepair: item.stockInRepair,
      stockBroken: item.stockBroken,
      stockMissing: item.stockMissing,
      pricePerDay: Number(item.pricePerDay),
      categoryIds: item.categories.map((entry) => entry.categoryId),
      imageUrls: item.images.map((image) => image.url),
    })),
  });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }
  if (!canManageCatalog(auth.user.role)) {
    return fail(403, "Only warehouse/admin can manage catalog.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid JSON body.");
  }
  if (!body || typeof body !== "object") {
    return fail(400, "Invalid payload.");
  }

  const payload = body as Record<string, unknown>;
  const itemId =
    typeof payload.itemId === "string" && payload.itemId.trim().length > 0
      ? payload.itemId.trim()
      : null;
  if (!itemId) {
    return fail(400, "itemId is required.");
  }

  const current = await prisma.item.findUnique({
    where: { id: itemId },
  });
  if (!current) {
    return fail(404, "Item not found.");
  }

  const itemType = payload.itemType !== undefined ? parseItemType(payload.itemType) : undefined;
  if (payload.itemType !== undefined && !itemType) {
    return fail(400, "Invalid itemType.");
  }

  const stockTotal =
    typeof payload.stockTotal === "number" &&
    Number.isInteger(payload.stockTotal) &&
    payload.stockTotal >= 0
      ? payload.stockTotal
      : undefined;
  if (payload.stockTotal !== undefined && stockTotal === undefined) {
    return fail(400, "stockTotal must be a non-negative integer.");
  }

  const pricePerDay =
    typeof payload.pricePerDay === "number" && payload.pricePerDay >= 0
      ? new Prisma.Decimal(payload.pricePerDay)
      : undefined;
  if (payload.pricePerDay !== undefined && pricePerDay === undefined) {
    return fail(400, "pricePerDay must be a non-negative number.");
  }

  const stockInRepair =
    typeof payload.stockInRepair === "number" &&
    Number.isInteger(payload.stockInRepair) &&
    payload.stockInRepair >= 0
      ? payload.stockInRepair
      : undefined;
  if (payload.stockInRepair !== undefined && stockInRepair === undefined) {
    return fail(400, "stockInRepair must be a non-negative integer.");
  }

  const stockBroken =
    typeof payload.stockBroken === "number" &&
    Number.isInteger(payload.stockBroken) &&
    payload.stockBroken >= 0
      ? payload.stockBroken
      : undefined;
  if (payload.stockBroken !== undefined && stockBroken === undefined) {
    return fail(400, "stockBroken must be a non-negative integer.");
  }

  const stockMissing =
    typeof payload.stockMissing === "number" &&
    Number.isInteger(payload.stockMissing) &&
    payload.stockMissing >= 0
      ? payload.stockMissing
      : undefined;
  if (payload.stockMissing !== undefined && stockMissing === undefined) {
    return fail(400, "stockMissing must be a non-negative integer.");
  }

  const availabilityStatus =
    payload.availabilityStatus !== undefined
      ? parseAvailabilityStatus(payload.availabilityStatus)
      : undefined;
  if (payload.availabilityStatus !== undefined && !availabilityStatus) {
    return fail(400, "Invalid availabilityStatus.");
  }

  const categoryIds =
    Array.isArray(payload.categoryIds) &&
    payload.categoryIds.every((entry) => typeof entry === "string" && entry.trim().length > 0)
      ? payload.categoryIds.map((entry) => (entry as string).trim())
      : undefined;
  if (payload.categoryIds !== undefined && !categoryIds) {
    return fail(400, "categoryIds must be array of strings.");
  }

  const imageUrls =
    Array.isArray(payload.imageUrls) &&
    payload.imageUrls.every((entry) => typeof entry === "string" && entry.trim().length > 0)
      ? payload.imageUrls.map((entry) => (entry as string).trim())
      : undefined;
  if (payload.imageUrls !== undefined && !imageUrls) {
    return fail(400, "imageUrls must be array of strings.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.item.update({
      where: { id: itemId },
      data: {
        name:
          typeof payload.name === "string" && payload.name.trim().length > 0
            ? payload.name.trim()
            : current.name,
        description:
          payload.description === null
            ? null
            : typeof payload.description === "string"
              ? payload.description.trim()
              : current.description,
        locationText:
          payload.locationText === null
            ? null
            : typeof payload.locationText === "string"
              ? payload.locationText.trim()
              : current.locationText,
        itemType: itemType ?? current.itemType,
        stockTotal: stockTotal ?? current.stockTotal,
        stockInRepair: stockInRepair ?? current.stockInRepair,
        stockBroken: stockBroken ?? current.stockBroken,
        stockMissing: stockMissing ?? current.stockMissing,
        availabilityStatus: availabilityStatus ?? current.availabilityStatus,
        pricePerDay: pricePerDay ?? current.pricePerDay,
      },
    });

    if (categoryIds) {
      await tx.itemCategory.deleteMany({ where: { itemId } });
      if (categoryIds.length > 0) {
        await tx.itemCategory.createMany({
          data: categoryIds.map((categoryId) => ({ itemId, categoryId })),
          skipDuplicates: true,
        });
      }
    }

    if (imageUrls) {
      await tx.itemImage.deleteMany({ where: { itemId } });
      if (imageUrls.length > 0) {
        await tx.itemImage.createMany({
          data: imageUrls.map((url) => ({
            itemId,
            url,
          })),
        });
      }
    }

    return tx.item.findUniqueOrThrow({
      where: { id: itemId },
      include: {
        categories: true,
        images: true,
      },
    });
  });

  return NextResponse.json({
    item: {
      id: updated.id,
      name: updated.name,
      itemType: updated.itemType,
      availabilityStatus: updated.availabilityStatus,
      stockTotal: updated.stockTotal,
      stockInRepair: updated.stockInRepair,
      stockBroken: updated.stockBroken,
      stockMissing: updated.stockMissing,
      pricePerDay: Number(updated.pricePerDay),
      categoryIds: updated.categories.map((entry) => entry.categoryId),
      imageUrls: updated.images.map((image) => image.url),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }
  if (!canManageCatalog(auth.user.role)) {
    return fail(403, "Only warehouse/admin can manage catalog.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid JSON body.");
  }
  if (!body || typeof body !== "object") {
    return fail(400, "Invalid payload.");
  }

  const payload = body as Record<string, unknown>;
  const itemId =
    typeof payload.itemId === "string" && payload.itemId.trim().length > 0
      ? payload.itemId.trim()
      : null;
  if (!itemId) {
    return fail(400, "itemId is required.");
  }

  const current = await prisma.item.findUnique({
    where: { id: itemId },
    include: {
      _count: {
        select: {
          orderLines: true,
          incidents: true,
          kitLines: true,
        },
      },
    },
  });
  if (!current) {
    return fail(404, "Item not found.");
  }

  const hasHistory =
    current._count.orderLines > 0 ||
    current._count.incidents > 0 ||
    current._count.kitLines > 0;

  if (hasHistory) {
    await prisma.item.update({
      where: { id: itemId },
      data: { availabilityStatus: AvailabilityStatus.RETIRED },
    });
    return NextResponse.json({
      ok: true,
      mode: "retired",
      message:
        "Item has history links and cannot be hard-deleted. It was marked as RETIRED.",
    });
  }

  await prisma.item.delete({ where: { id: itemId } });
  return NextResponse.json({ ok: true, mode: "deleted" });
}
