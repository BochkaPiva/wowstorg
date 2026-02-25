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
  /** Topic (thread) id in a supergroup with topics enabled (forum). */
  messageThreadId?: number;
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
  if (options.messageThreadId !== undefined) {
    payload.message_thread_id = options.messageThreadId;
  }
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

export async function sendTelegramDocument(options: {
  chatId: number | string;
  buffer: Buffer;
  filename: string;
  caption?: string;
  /** Topic (thread) id in a supergroup with topics enabled (forum). */
  messageThreadId?: number;
}): Promise<void> {
  const base = getBotApiBase();
  const formData = new FormData();
  formData.append("chat_id", String(options.chatId));
  if (options.messageThreadId !== undefined) {
    formData.append("message_thread_id", String(options.messageThreadId));
  }
  const blobPart = new Uint8Array(options.buffer);
  formData.append(
    "document",
    new Blob([blobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    options.filename,
  );
  if (options.caption?.trim()) {
    formData.append("caption", options.caption.trim());
  }
  const response = await fetch(`${base}/sendDocument`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram sendDocument failed: ${response.status} ${text}`);
  }
}

export function getWebAppUrl(): string {
  return getRequiredEnv("TELEGRAM_WEBAPP_URL");
}
