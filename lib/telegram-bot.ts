import { getRequiredEnv } from "@/lib/env";

type TelegramInlineKeyboardButton = {
  text: string;
  web_app?: { url: string };
  url?: string;
};

type SendMessageOptions = {
  chatId: number | string;
  text: string;
  inlineKeyboard?: TelegramInlineKeyboardButton[][];
};

function getBotApiBase(): string {
  const token = getRequiredEnv("TELEGRAM_BOT_TOKEN");
  return `https://api.telegram.org/bot${token}`;
}

export async function sendTelegramMessage(options: SendMessageOptions): Promise<void> {
  const base = getBotApiBase();
  const payload: Record<string, unknown> = {
    chat_id: options.chatId,
    text: options.text,
  };

  if (options.inlineKeyboard) {
    payload.reply_markup = {
      inline_keyboard: options.inlineKeyboard,
    };
  }

  const response = await fetch(`${base}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram sendMessage failed: ${response.status} ${text}`);
  }
}

export function getWebAppUrl(): string {
  return getRequiredEnv("TELEGRAM_WEBAPP_URL");
}
