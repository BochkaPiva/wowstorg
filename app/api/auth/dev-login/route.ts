import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/session";

type DevLoginBody = {
  telegramId?: number;
  username?: string;
  role?: Role;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return fail(403, "Dev login is disabled in production.");
  }

  let body: DevLoginBody;
  try {
    body = (await request.json()) as DevLoginBody;
  } catch {
    return fail(400, "Invalid JSON body.");
  }

  if (!body.telegramId || !Number.isInteger(body.telegramId)) {
    return fail(400, "telegramId must be an integer.");
  }

  const role = body.role ?? Role.GREENWICH;
  if (!Object.values(Role).includes(role)) {
    return fail(400, "Invalid role.");
  }

  const telegramId = BigInt(body.telegramId);

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: {
      username: body.username ?? null,
      role,
    },
    create: {
      telegramId,
      username: body.username ?? null,
      role,
    },
  });

  const response = NextResponse.json({
    user: {
      id: user.id,
      telegramId: user.telegramId.toString(),
      username: user.username,
      role: user.role,
    },
  });

  return setSessionCookie(response, {
    userId: user.id,
    telegramId: user.telegramId.toString(),
    role: user.role,
  });
}
