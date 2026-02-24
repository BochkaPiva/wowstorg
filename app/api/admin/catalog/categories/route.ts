import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isWarehouseSide, requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function canManageCatalog(role: Role): boolean {
  return isWarehouseSide(role);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }
  if (!canManageCatalog(auth.user.role)) {
    return fail(403, "Only warehouse/admin can manage catalog.");
  }

  const categories = await prisma.category.findMany({
    orderBy: [{ name: "asc" }],
    include: {
      _count: { select: { items: true } },
      items: {
        include: {
          item: { select: { id: true, name: true } },
        },
        orderBy: { item: { name: "asc" } },
      },
    },
  });

  return NextResponse.json({
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      itemCount: category._count.items,
      items: category.items.map((entry) => ({
        id: entry.item.id,
        name: entry.item.name,
      })),
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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
  const name =
    typeof payload.name === "string" && payload.name.trim().length > 0
      ? payload.name.trim()
      : null;
  if (!name) {
    return fail(400, "name is required.");
  }

  const category = await prisma.category.upsert({
    where: { name },
    update: {
      description:
        typeof payload.description === "string" && payload.description.trim().length > 0
          ? payload.description.trim()
          : null,
    },
    create: {
      name,
      description:
        typeof payload.description === "string" && payload.description.trim().length > 0
          ? payload.description.trim()
          : null,
    },
  });

  return NextResponse.json({
    category: {
      id: category.id,
      name: category.name,
      description: category.description,
      updatedAt: category.updatedAt.toISOString(),
    },
  });
}
