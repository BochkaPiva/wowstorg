import { NextRequest, NextResponse } from "next/server";
import { fail } from "@/lib/http";
import { getWebAppUrl, sendTelegramMessage } from "@/lib/telegram-bot";

type TelegramMessage = {
  chat?: {
    id: number;
  };
  text?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

function buildMainKeyboard(url: string) {
  return [[{ text: "Open Warehouse App", web_app: { url } }]];
}

async function handleCommand(chatId: number, command: string): Promise<void> {
  const webAppUrl = getWebAppUrl();

  if (command.startsWith("/start")) {
    await sendTelegramMessage({
      chatId,
      text: "Добро пожаловать. Нажмите кнопку ниже, чтобы открыть мини-приложение.",
      inlineKeyboard: buildMainKeyboard(webAppUrl),
    });
    return;
  }

  if (command.startsWith("/my")) {
    await sendTelegramMessage({
      chatId,
      text: "Open your orders in Mini App.",
      inlineKeyboard: buildMainKeyboard(webAppUrl),
    });
    return;
  }

  if (command.startsWith("/emergency")) {
    await sendTelegramMessage({
      chatId,
      text: "Emergency flow is available in Mini App queue.",
      inlineKeyboard: buildMainKeyboard(webAppUrl),
    });
    return;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return fail(400, "Invalid Telegram update body.");
  }

  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();

  if (chatId && text?.startsWith("/")) {
    try {
      await handleCommand(chatId, text);
    } catch (error) {
      console.error("Telegram webhook command error:", error);
    }
  }

  return NextResponse.json({ ok: true });
}
