import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }
  if (auth.user.role !== Role.ADMIN) {
    return fail(403, "Only admin can manage users.");
  }

  const { id } = await params;
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) {
    return fail(404, "User not found.");
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
  const role =
    payload.role === Role.GREENWICH ||
    payload.role === Role.WAREHOUSE ||
    payload.role === Role.ADMIN
      ? payload.role
      : current.role;

  const updated = await prisma.user.update({
    where: { id },
    data: {
      role,
      username:
        payload.username === null
          ? null
          : typeof payload.username === "string"
            ? payload.username.trim()
            : current.username,
    },
  });

  return NextResponse.json({
    user: {
      id: updated.id,
      telegramId: updated.telegramId.toString(),
      username: updated.username,
      role: updated.role,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
