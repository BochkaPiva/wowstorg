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

function roleTiles(role: AppRole | null): Tile[] {
  if (role === "GREENWICH") {
    return [
      { href: "/orders/new", title: "Создать заявку", description: "Заказчик обязателен, мероприятие опционально" },
      { href: "/my-orders", title: "Мои заявки", description: "Статусы и возврат по выданным заказам" },
      { href: "/catalog", title: "Каталог", description: "Наличие по датам и цены со скидкой 30%" },
    ];
  }
  if (role === "WAREHOUSE") {
    return [
      { href: "/orders/new", title: "Быстрая выдача", description: "Внешний заказ сразу в выдачу" },
      { href: "/warehouse/queue", title: "Очередь склада", description: "Approve, issue, check-in" },
      { href: "/catalog", title: "Инвентарь", description: "Проверка доступности и остатков" },
    ];
  }
  if (role === "ADMIN") {
    return [
      { href: "/orders/new", title: "Быстрая выдача", description: "Оформление внешних заказов" },
      { href: "/warehouse/queue", title: "Очередь склада", description: "Полный операционный контроль" },
      { href: "/catalog", title: "Инвентарь", description: "Позиции, доступность, цены" },
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

      const tgInitData =
        (globalThis as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram
          ?.WebApp?.initData ?? "";

      if (tgInitData) {
        await fetch("/api/auth/telegram/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ initData: tgInitData }),
        });

        const retry = await fetch("/api/auth/me", { credentials: "include" });
        if (retry.ok) {
          const payload = (await retry.json()) as AuthMePayload;
          if (!ignore) {
            setUser(payload.user);
            setStatus("Готово.");
          }
          return;
        }
      }

      if (!ignore) {
        setStatus("Нет активной сессии. Используйте Dev Login или войдите через Telegram Mini App.");
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
      <h1 className="text-2xl font-semibold">Warehouse System</h1>
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
