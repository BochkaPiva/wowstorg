import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

function isAdmin(role: Role): boolean {
  return role === Role.ADMIN;
}

export async function PATCH(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }
  if (!isAdmin(auth.user.role)) {
    return fail(403, "Only admin can manage catalog.");
  }

  const { id } = await params;
  const current = await prisma.category.findUnique({ where: { id } });
  if (!current) {
    return fail(404, "Category not found.");
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
  const updated = await prisma.category.update({
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
    },
  });

  return NextResponse.json({
    category: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
