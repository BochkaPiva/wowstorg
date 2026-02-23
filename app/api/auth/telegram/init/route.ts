import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getRequiredEnv } from "@/lib/env";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/session";
import { verifyTelegramInitData } from "@/lib/telegram-auth";

type InitAuthBody = {
  initData?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: InitAuthBody;

  try {
    body = (await request.json()) as InitAuthBody;
  } catch {
    return fail(400, "Invalid JSON body.");
  }

  const initData = body.initData?.trim();
  if (!initData) {
    return fail(400, "Field 'initData' is required.");
  }

  let botToken: string;
  try {
    botToken = getRequiredEnv("TELEGRAM_BOT_TOKEN");
  } catch {
    return fail(500, "Missing TELEGRAM_BOT_TOKEN on server.");
  }

  const verified = verifyTelegramInitData(initData, botToken);
  if (!verified.ok) {
    return fail(401, verified.reason);
  }

  const telegramUser = verified.value.user;
  const telegramId = BigInt(telegramUser.id);

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: {
      username: telegramUser.username ?? null,
    },
    create: {
      telegramId,
      username: telegramUser.username ?? null,
      role: Role.GREENWICH,
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
