"use client";

import Link from "next/link";

const SCENARIOS = [
  {
    href: "/warehouse/inventory/items",
    title: "Позиции реквизита",
    description: "CRUD позиций, фото, количество, статусы",
  },
  {
    href: "/warehouse/inventory/categories",
    title: "Подборки",
    description: "CRUD категорий и структура подборок",
  },
  {
    href: "/warehouse/inventory/kits",
    title: "Пакеты",
    description: "CRUD готовых пакетов и их состав",
  },
];

export default function WarehouseInventoryPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-[var(--brand)]">Инвентарь</h1>
      <p className="text-sm text-[var(--muted)]">
        Управление списком реквизита, подборками и пакетами.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SCENARIOS.map((scenario) => (
          <Link
            key={scenario.href}
            href={scenario.href}
            className="ws-card border p-4 hover:bg-violet-50"
          >
            <div className="font-medium">{scenario.title}</div>
            <div className="text-sm text-[var(--muted)]">{scenario.description}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
