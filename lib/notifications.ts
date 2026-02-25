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
  deliveryRequested?: boolean;
  deliveryComment?: string | null;
  mountRequested?: boolean;
  mountComment?: string | null;
  dismountRequested?: boolean;
  dismountComment?: string | null;
}): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      role: { in: [Role.WAREHOUSE, Role.ADMIN] },
    },
    select: { telegramId: true },
  });

  const serviceLines: string[] = [];
  if (params.deliveryRequested) {
    serviceLines.push(`Доставка: ${params.deliveryComment?.trim() || "—"}`);
  }
  if (params.mountRequested) {
    serviceLines.push(`Монтаж: ${params.mountComment?.trim() || "—"}`);
  }
  if (params.dismountRequested) {
    serviceLines.push(`Демонтаж: ${params.dismountComment?.trim() || "—"}`);
  }
  const servicesBlock =
    serviceLines.length > 0 ? `Услуги:\n${serviceLines.map((s) => `  ${s}`).join("\n")}` : "";

  const text = [
    "Новая заявка в очереди.",
    `Заявка: ${params.orderId}`,
    `Заказчик: ${params.customerName ?? "-"}`,
    `Период: ${params.startDate} - ${params.endDate}`,
    servicesBlock,
  ]
    .filter(Boolean)
    .join("\n\n");

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

export async function notifyAdminsAboutOrderEdit(params: {
  orderId: string;
  customerName: string | null;
  startDate: string;
  endDate: string;
  compositionSummary: string;
}): Promise<void> {
  const users = await prisma.user.findMany({
    where: { role: Role.ADMIN },
    select: { telegramId: true },
  });
  if (users.length === 0) return;

  const text = [
    "Заявка изменена клиентом.",
    `Заявка: ${params.orderId}`,
    `Заказчик: ${params.customerName ?? "—"}`,
    `Период: ${params.startDate} — ${params.endDate}`,
    `Состав: ${params.compositionSummary}`,
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

const MOSCOW_DATE_FORMATTER = new Intl.DateTimeFormat("fr-CA", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Возвращает сегодняшнюю дату в Москве в формате YYYY-MM-DD */
export function getTodayMoscow(): string {
  return MOSCOW_DATE_FORMATTER.format(new Date());
}

/** Напоминание владельцу заявки: сегодня последний день аренды */
export async function notifyOwnerLastDayOfRental(params: {
  ownerTelegramId: string;
  orderId: string;
  endDate: string;
  customerName: string | null;
  eventName?: string | null;
}): Promise<void> {
  const text = [
    "Напоминание: сегодня последний день аренды по заявке.",
    `Заявка: ${params.orderId}`,
    `Период аренды до: ${params.endDate}`,
    params.customerName ? `Заказчик: ${params.customerName}` : "",
    params.eventName ? `Мероприятие: ${params.eventName}` : "",
    "",
    "Подайте возврат реквизита в разделе «Мои заявки», когда будете сдавать позиции.",
  ]
    .filter(Boolean)
    .join("\n");

  await safeSend(
    sendTelegramMessage({
      chatId: params.ownerTelegramId,
      text,
      inlineKeyboard: [[{ text: "Мои заявки", web_app: { url: getWebAppUrl() } }]],
    }),
  );
}

/** Уведомление владельцу заявки: просрочка сдачи на приемку */
export async function notifyOwnerOverdueReturn(params: {
  ownerTelegramId: string;
  orderId: string;
  endDate: string;
  customerName: string | null;
  eventName?: string | null;
  daysOverdue: number;
}): Promise<void> {
  const daysWord =
    params.daysOverdue === 1
      ? "1 день"
      : params.daysOverdue >= 2 && params.daysOverdue <= 4
        ? `${params.daysOverdue} дня`
        : `${params.daysOverdue} дней`;

  const text = [
    "Просрочка сдачи на приемку.",
    `Заявка: ${params.orderId}`,
    `Период аренды закончился: ${params.endDate} (просрочка ${daysWord}).`,
    params.customerName ? `Заказчик: ${params.customerName}` : "",
    params.eventName ? `Мероприятие: ${params.eventName}` : "",
    "",
    "Пожалуйста, подайте возврат реквизита в разделе «Мои заявки» и сдайте позиции складу.",
  ]
    .filter(Boolean)
    .join("\n");

  await safeSend(
    sendTelegramMessage({
      chatId: params.ownerTelegramId,
      text,
      inlineKeyboard: [[{ text: "Мои заявки", web_app: { url: getWebAppUrl() } }]],
    }),
  );
}
