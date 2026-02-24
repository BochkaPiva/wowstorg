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
  const telegramIdString = String(telegramUser.id);
  const telegramId = BigInt(telegramIdString);

  const isConnectionError = (e: unknown): boolean => {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    return ["P1017", "P2024", "P1001", "P1002", "P1008", "P1017"].includes(code);
  };

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { telegramId },
    });
  } catch (e) {
    if (isConnectionError(e)) {
      try {
        await new Promise((r) => setTimeout(r, 800));
        user = await prisma.user.findUnique({ where: { telegramId } });
      } catch (retryErr) {
        console.error("[auth/telegram/init] DB error on findUnique (after retry):", retryErr);
        return fail(503, "Сервис временно недоступен. Попробуйте через минуту.");
      }
    } else {
      console.error("[auth/telegram/init] DB error on findUnique:", e);
      return fail(500, "Ошибка при входе. Попробуйте ещё раз или обратитесь в поддержку.");
    }
  }

  // Strict access mode: only users already whitelisted in DB can sign in.
  // To bootstrap first admin, set TELEGRAM_BOOTSTRAP_ADMIN_IDS="123,456".
  if (!user) {
    const bootstrapAdmins = parseBootstrapAdminIds(
      process.env.TELEGRAM_BOOTSTRAP_ADMIN_IDS,
    );
    if (!bootstrapAdmins.has(telegramIdString)) {
      return fail(403, "Access denied. Ask admin to grant your Telegram ID.");
    }

    try {
      user = await prisma.user.create({
        data: {
          telegramId,
          username: telegramUser.username ?? null,
          role: Role.ADMIN,
        },
      });
    } catch (e) {
      console.error("[auth/telegram/init] DB error on create:", e);
      if (isConnectionError(e)) {
        return fail(503, "Сервис временно недоступен. Попробуйте через минуту.");
      }
      return fail(500, "Ошибка при входе. Попробуйте ещё раз или обратитесь в поддержку.");
    }
  } else if (user.username !== (telegramUser.username ?? null)) {
    try {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          username: telegramUser.username ?? null,
        },
      });
    } catch (e) {
      console.error("[auth/telegram/init] DB error on update:", e);
      if (isConnectionError(e)) {
        return fail(503, "Сервис временно недоступен. Попробуйте через минуту.");
      }
      return fail(500, "Ошибка при входе. Попробуйте ещё раз или обратитесь в поддержку.");
    }
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
}
