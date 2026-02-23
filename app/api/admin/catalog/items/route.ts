import { ItemType, Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function isAdmin(role: Role): boolean {
  return role === Role.ADMIN;
}

function parseItemType(raw: unknown): ItemType | null {
  return raw === ItemType.ASSET || raw === ItemType.BULK || raw === ItemType.CONSUMABLE
    ? raw
    : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }
  if (!isAdmin(auth.user.role)) {
    return fail(403, "Only admin can manage catalog.");
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
  if (!isAdmin(auth.user.role)) {
    return fail(403, "Only admin can manage catalog.");
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
      stockTotal: updated.stockTotal,
      pricePerDay: Number(updated.pricePerDay),
      categoryIds: updated.categories.map((entry) => entry.categoryId),
      imageUrls: updated.images.map((image) => image.url),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
