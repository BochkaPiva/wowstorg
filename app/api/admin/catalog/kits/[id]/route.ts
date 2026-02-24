import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isWarehouseSide, requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

function canManageCatalog(role: Role): boolean {
  return isWarehouseSide(role);
}

type KitLineInput = {
  itemId: string;
  defaultQty: number;
};

function parseLines(input: unknown): KitLineInput[] | null {
  if (input === undefined) {
    return [];
  }
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

export async function PATCH(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }
  if (!canManageCatalog(auth.user.role)) {
    return fail(403, "Only warehouse/admin can manage catalog.");
  }

  const { id } = await params;
  const current = await prisma.kit.findUnique({ where: { id } });
  if (!current) {
    return fail(404, "Kit not found.");
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

  const parsedLines = parseLines(payload.lines);
  if (payload.lines !== undefined && parsedLines === null) {
    return fail(400, "Invalid lines payload.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.kit.update({
      where: { id },
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
        coverImageUrl:
          payload.coverImageUrl === null
            ? null
            : typeof payload.coverImageUrl === "string"
              ? payload.coverImageUrl.trim()
              : current.coverImageUrl,
        isActive:
          typeof payload.isActive === "boolean" ? payload.isActive : current.isActive,
      },
    });

    if (Array.isArray(parsedLines)) {
      await tx.kitLine.deleteMany({ where: { kitId: id } });
      await tx.kitLine.createMany({
        data: parsedLines.map((line) => ({
          kitId: id,
          itemId: line.itemId,
          defaultQty: line.defaultQty,
        })),
      });
    }

    return tx.kit.findUniqueOrThrow({
      where: { id },
      include: { lines: { orderBy: [{ id: "asc" }] } },
    });
  });

  return NextResponse.json({
    kit: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      coverImageUrl: updated.coverImageUrl,
      isActive: updated.isActive,
      updatedAt: updated.updatedAt.toISOString(),
      lines: updated.lines.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        defaultQty: line.defaultQty,
      })),
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }
  if (!canManageCatalog(auth.user.role)) {
    return fail(403, "Only warehouse/admin can manage catalog.");
  }

  const { id } = await params;
  const current = await prisma.kit.findUnique({ where: { id } });
  if (!current) {
    return fail(404, "Kit not found.");
  }

  await prisma.kit.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
