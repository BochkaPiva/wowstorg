import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function isAdmin(role: Role): boolean {
  return role === Role.ADMIN;
}

type KitLineInput = {
  itemId: string;
  defaultQty: number;
};

function parseLines(input: unknown): KitLineInput[] | null {
  if (!Array.isArray(input) || input.length === 0) {
    return null;
  }

  const lines: KitLineInput[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const line = raw as Record<string, unknown>;
    const itemId =
      typeof line.itemId === "string" && line.itemId.trim().length > 0
        ? line.itemId.trim()
        : null;
    const defaultQty =
      typeof line.defaultQty === "number" &&
      Number.isInteger(line.defaultQty) &&
      line.defaultQty > 0
        ? line.defaultQty
        : null;
    if (!itemId || defaultQty === null) {
      return null;
    }
    lines.push({ itemId, defaultQty });
  }

  return lines;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }
  if (!isAdmin(auth.user.role)) {
    return fail(403, "Only admin can manage catalog.");
  }

  const kits = await prisma.kit.findMany({
    orderBy: [{ name: "asc" }],
    include: {
      lines: {
        orderBy: [{ id: "asc" }],
      },
    },
  });

  return NextResponse.json({
    kits: kits.map((kit) => ({
      id: kit.id,
      name: kit.name,
      description: kit.description,
      coverImageUrl: kit.coverImageUrl,
      isActive: kit.isActive,
      updatedAt: kit.updatedAt.toISOString(),
      lines: kit.lines.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        defaultQty: line.defaultQty,
      })),
    })),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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
  const name =
    typeof payload.name === "string" && payload.name.trim().length > 0
      ? payload.name.trim()
      : null;
  const lines = parseLines(payload.lines);
  if (!name || !lines) {
    return fail(400, "name and lines are required.");
  }

  const created = await prisma.$transaction(async (tx) => {
    const kit = await tx.kit.create({
      data: {
        name,
        description:
          typeof payload.description === "string" && payload.description.trim().length > 0
            ? payload.description.trim()
            : null,
        coverImageUrl:
          typeof payload.coverImageUrl === "string" && payload.coverImageUrl.trim().length > 0
            ? payload.coverImageUrl.trim()
            : null,
        isActive: payload.isActive === false ? false : true,
      },
    });

    await tx.kitLine.createMany({
      data: lines.map((line) => ({
        kitId: kit.id,
        itemId: line.itemId,
        defaultQty: line.defaultQty,
      })),
    });

    return tx.kit.findUniqueOrThrow({
      where: { id: kit.id },
      include: { lines: { orderBy: [{ id: "asc" }] } },
    });
  });

  return NextResponse.json({
    kit: {
      id: created.id,
      name: created.name,
      description: created.description,
      coverImageUrl: created.coverImageUrl,
      isActive: created.isActive,
      lines: created.lines.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        defaultQty: line.defaultQty,
      })),
    },
  });
}
