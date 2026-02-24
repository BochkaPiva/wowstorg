import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getWebAppUrl, sendTelegramMessage } from "@/lib/telegram-bot";

function buildOrderLink(orderId: string): string {
  const base = getWebAppUrl().replace(/\/+$/, "");
  return `${base}/warehouse/queue?orderId=${encodeURIComponent(orderId)}`;
}

async function safeSend(task: Promise<void>, timeoutMs = 5000): Promise<void> {
  try {
    await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        globalThis.setTimeout(() => reject(new Error("Telegram notification timeout")), timeoutMs);
      }),
    ]);
  } catch {
    // Notifications are best-effort and must not break business endpoints.
  }
}

export async function notifyWarehouseAboutNewOrder(params: {
  orderId: string;
  customerName: string | null;
  startDate: string;
  endDate: string;
}): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      role: { in: [Role.WAREHOUSE, Role.ADMIN] },
    },
    select: { telegramId: true },
  });

  const text = [
    "Новая заявка в очереди.",
    `Заявка: ${params.orderId}`,
    `Заказчик: ${params.customerName ?? "-"}`,
    `Период: ${params.startDate} - ${params.endDate}`,
  ].join("\n");

  await Promise.allSettled(
    users.map((user) =>
      safeSend(
        sendTelegramMessage({
          chatId: user.telegramId.toString(),
          text,
          inlineKeyboard: [[{ text: "Открыть очередь", web_app: { url: buildOrderLink(params.orderId) } }]],
        }),
      ),
    ),
  );
}

export async function notifyOrderOwner(params: {
  ownerTelegramId: string | null;
  title: string;
  startDate: string;
  endDate: string;
  customerName: string | null;
  eventName?: string | null;
  blocks: Array<{
    title: string;
    lines: string[];
  }>;
  comment?: string | null;
}): Promise<void> {
  if (!params.ownerTelegramId) return;

  const blockText = params.blocks
    .filter((block) => block.lines.length > 0)
    .map((block) => `${block.title}\n${block.lines.map((line) => `- ${line}`).join("\n")}`)
    .join("\n\n");

  const text = [
    params.title,
    `Период аренды: ${params.startDate} - ${params.endDate}`,
    `Заказчик: ${params.customerName ?? "-"}`,
    params.eventName ? `Мероприятие: ${params.eventName}` : "",
    blockText,
    params.comment ? `Комментарий: ${params.comment}` : "",
  ]
    .filter((entry) => entry.length > 0)
    .join("\n");

  await safeSend(
    sendTelegramMessage({
      chatId: params.ownerTelegramId,
      text,
      inlineKeyboard: [[{ text: "Открыть мини-апп", web_app: { url: getWebAppUrl() } }]],
    }),
  );
}
