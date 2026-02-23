import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function ensureAdmin(role: Role): boolean {
  return role === Role.ADMIN;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }
  if (!ensureAdmin(auth.user.role)) {
    return fail(403, "Only admin can manage users.");
  }

  const search = request.nextUrl.searchParams.get("search")?.trim();
  const users = await prisma.user.findMany({
    where: search
      ? {
          OR: [
            { username: { contains: search, mode: "insensitive" } },
            { telegramId: BigInt(Number(search) || 0) },
          ],
        }
      : undefined,
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });

  return NextResponse.json({
    users: users.map((user) => ({
      id: user.id,
      telegramId: user.telegramId.toString(),
      username: user.username,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }
  if (!ensureAdmin(auth.user.role)) {
    return fail(403, "Only admin can manage users.");
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
  const telegramIdRaw =
    typeof payload.telegramId === "string"
      ? payload.telegramId.trim()
      : typeof payload.telegramId === "number"
        ? String(payload.telegramId)
        : "";
  if (!/^\d+$/.test(telegramIdRaw)) {
    return fail(400, "telegramId is required.");
  }

  const role =
    payload.role === Role.GREENWICH ||
    payload.role === Role.WAREHOUSE ||
    payload.role === Role.ADMIN
      ? payload.role
      : null;
  if (!role) {
    return fail(400, "role is required.");
  }

  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(telegramIdRaw) },
    update: {
      role,
      username:
        typeof payload.username === "string" && payload.username.trim().length > 0
          ? payload.username.trim()
          : null,
    },
    create: {
      telegramId: BigInt(telegramIdRaw),
      role,
      username:
        typeof payload.username === "string" && payload.username.trim().length > 0
          ? payload.username.trim()
          : null,
    },
  });

  return NextResponse.json({
    user: {
      id: user.id,
      telegramId: user.telegramId.toString(),
      username: user.username,
      role: user.role,
    },
  });
}
