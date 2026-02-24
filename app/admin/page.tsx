"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Role = "GREENWICH" | "WAREHOUSE" | "ADMIN";

type AuthMePayload = {
  user?: {
    role: Role;
    username: string | null;
  };
};

const SCENARIOS = [
  {
    href: "/admin/users",
    title: "Доступы пользователей",
    description: "Добавление сотрудников и назначение ролей",
  },
  {
    href: "/admin/customers",
    title: "Заказчики",
    description: "База клиентов, контакты, активность",
  },
  {
    href: "/admin/analytics",
    title: "Аналитика",
    description: "Топ реквизита и топ заказчиков за период",
  },
];

export default function AdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [status, setStatus] = useState("Проверяем доступ...");

  useEffect(() => {
    let ignore = false;

    async function verify() {
      const response = await fetch("/api/auth/me");
      if (!response.ok) {
        if (!ignore) {
          setAllowed(false);
          setStatus("Нужна авторизация.");
        }
        return;
      }

      const payload = (await response.json()) as AuthMePayload;
      if (!payload.user || payload.user.role !== "ADMIN") {
        if (!ignore) {
          setAllowed(false);
          setStatus("Доступ запрещен: только ADMIN.");
        }
        return;
      }

      if (!ignore) {
        setAllowed(true);
        setStatus("Выберите нужный сценарий.");
      }
    }

    void verify();
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Админка</h1>
        <button className="ws-btn" onClick={() => { globalThis.location.href = "/"; }}>
          Назад
        </button>
      </div>
      <p className="text-sm text-zinc-700">{status}</p>

      {allowed ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {SCENARIOS.map((scenario) => (
            <Link
              key={scenario.href}
              href={scenario.href}
              className="rounded border border-zinc-200 bg-white p-4 hover:bg-zinc-50"
            >
              <div className="font-medium">{scenario.title}</div>
              <div className="text-sm text-zinc-600">{scenario.description}</div>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
