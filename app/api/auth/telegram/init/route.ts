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

function parseBootstrapAdminIds(raw: string | undefined): Set<string> {
  if (!raw) {
    return new Set();
  }

  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value)),
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
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
  const telegramIdString = String(telegramUser.id).trim();
  if (!/^\d+$/.test(telegramIdString)) {
    return fail(400, "Invalid Telegram user id.");
  }
  const telegramId = BigInt(telegramIdString);

  let user = await prisma.user.findUnique({
    where: { telegramId },
  });

  // Strict access mode: only users already whitelisted in DB can sign in.
  // To bootstrap first admin, set TELEGRAM_BOOTSTRAP_ADMIN_IDS="123,456".
  if (!user) {
    const bootstrapAdmins = parseBootstrapAdminIds(
      process.env.TELEGRAM_BOOTSTRAP_ADMIN_IDS,
    );
    if (!bootstrapAdmins.has(telegramIdString)) {
      return fail(403, "Access denied. Ask admin to grant your Telegram ID.");
    }

    user = await prisma.user.create({
      data: {
        telegramId,
        username: telegramUser.username ?? null,
        role: Role.ADMIN,
      },
    });
  } else if (user.username !== (telegramUser.username ?? null)) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        username: telegramUser.username ?? null,
      },
    });
  }

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
  } catch (error) {
    const message =
      error instanceof Error && process.env.NODE_ENV !== "production"
        ? `Telegram init failed: ${error.message}`
        : "Telegram init failed.";
    return fail(500, message);
  }
}
