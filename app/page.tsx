"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AuthMePayload = {
  user?: {
    id: string;
    role: "GREENWICH" | "WAREHOUSE" | "ADMIN";
    username: string | null;
  };
};

type AppRole = NonNullable<AuthMePayload["user"]>["role"];

type Tile = {
  href: string;
  title: string;
  description: string;
};

type TelegramGlobal = {
  Telegram?: {
    WebApp?: {
      initData?: string;
    };
  };
};

function getInitDataFromTelegramObject(): string {
  return ((globalThis as unknown as TelegramGlobal).Telegram?.WebApp?.initData ?? "").trim();
}

function getInitDataFromUrl(): string {
  const fromSearch = new URLSearchParams(globalThis.location.search).get("tgWebAppData");
  if (fromSearch && fromSearch.trim().length > 0) {
    return fromSearch.trim();
  }

  const hash = globalThis.location.hash.startsWith("#")
    ? globalThis.location.hash.slice(1)
    : globalThis.location.hash;
  const fromHash = new URLSearchParams(hash).get("tgWebAppData");
  return fromHash?.trim() ?? "";
}

async function resolveTelegramInitData(maxAttempts = 8, delayMs = 250): Promise<string> {
  // Telegram WebApp object can appear slightly after first paint in some clients.
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const fromObject = getInitDataFromTelegramObject();
    if (fromObject) {
      return fromObject;
    }

    const fromUrl = getInitDataFromUrl();
    if (fromUrl) {
      return fromUrl;
    }

    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, delayMs);
    });
  }

  return "";
}

function roleTiles(role: AppRole | null): Tile[] {
  if (role === "GREENWICH") {
    return [
      { href: "/catalog", title: "Каталог и оформление", description: "Соберите корзину и оформите заявку" },
      { href: "/my-orders", title: "Мои заявки", description: "Статусы, выдача и возврат" },
    ];
  }
  if (role === "WAREHOUSE") {
    return [
      { href: "/orders/new", title: "Быстрая выдача", description: "Внешний заказ сразу в выдачу" },
      { href: "/warehouse/queue", title: "Очередь склада", description: "Approve, issue, check-in" },
      { href: "/warehouse/archive", title: "Архив склада", description: "Закрытые и отмененные заказы" },
      { href: "/catalog", title: "Инвентарь", description: "Проверка доступности и остатков" },
    ];
  }
  if (role === "ADMIN") {
    return [
      { href: "/orders/new", title: "Быстрая выдача", description: "Оформление внешних заказов" },
      { href: "/warehouse/queue", title: "Очередь склада", description: "Полный операционный контроль" },
      { href: "/warehouse/archive", title: "Архив склада", description: "История закрытых и отмененных заказов" },
      { href: "/catalog", title: "Инвентарь", description: "Позиции, доступность, цены" },
      { href: "/admin", title: "Админ панель", description: "Роли пользователей и база заказчиков" },
      { href: "/dev-login", title: "Сервисный вход", description: "Тестовые сессии для отладки" },
    ];
  }
  return [];
}

export default function Home() {
  const [status, setStatus] = useState("Определяем роль...");
  const [user, setUser] = useState<AuthMePayload["user"]>();

  useEffect(() => {
    let ignore = false;

    async function bootstrap() {
      const meResponse = await fetch("/api/auth/me", { credentials: "include" });
      if (meResponse.ok) {
        const payload = (await meResponse.json()) as AuthMePayload;
        if (!ignore) {
          setUser(payload.user);
          setStatus("Готово.");
        }
        return;
      }

      const tgInitData = await resolveTelegramInitData();

      if (tgInitData) {
        const initResponse = await fetch("/api/auth/telegram/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ initData: tgInitData }),
        });

        if (!initResponse.ok) {
          const initPayload = (await initResponse.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          if (!ignore) {
            setStatus(
              `Ошибка авторизации Telegram: ${
                initPayload?.error?.message ?? `HTTP ${initResponse.status}`
              }`,
            );
          }
          return;
        }

        const retry = await fetch("/api/auth/me", { credentials: "include" });
        if (retry.ok) {
          const payload = (await retry.json()) as AuthMePayload;
          if (!ignore) {
            setUser(payload.user);
            setStatus("Готово.");
          }
          return;
        }

        if (!ignore) {
          setStatus("Telegram login прошёл, но cookie-сессия не сохранилась.");
        }
        return;
      }

      if (!ignore) {
        setStatus("Нет активной сессии: Telegram initData не найден в WebApp.");
      }
    }

    void bootstrap();
    return () => {
      ignore = true;
    };
  }, []);

  const tiles = useMemo(() => roleTiles(user?.role ?? null), [user?.role]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-[var(--brand)]">WowStorg Hub</h1>
      <p className="text-zinc-600">{status}</p>
      {user ? (
        <p className="text-sm text-zinc-700">
          Вы вошли как <span className="font-medium">{user.username ?? user.id}</span> ({user.role})
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <Link key={tile.href} className="rounded border border-zinc-200 bg-white p-4 hover:bg-zinc-50" href={tile.href}>
            <div className="font-medium">{tile.title}</div>
            <div className="text-sm text-zinc-600">{tile.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
