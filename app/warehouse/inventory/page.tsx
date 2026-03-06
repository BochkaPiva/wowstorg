"use client";

import Link from "next/link";

/** Бледно-фиолетовые карточки: управление складом (позиции, подборки, пакеты). */
const ADMIN_SCENARIOS = [
  { href: "/warehouse/inventory/items", title: "Позиции и реквизит", description: "CRUD позиций, фото, количество, статусы" },
  { href: "/warehouse/inventory/categories", title: "Подборки", description: "CRUD категорий и структура подборок" },
  { href: "/warehouse/inventory/kits", title: "Пакеты", description: "CRUD готовых пакетов и их состав" },
];

/** Белые карточки: операции и учёт. */
const OTHER_SCENARIOS = [
  { href: "/warehouse/inventory/rented", title: "Сдано в аренду", description: "Какие позиции сейчас у клиентов и до какой даты" },
  { href: "/warehouse/lost-items", title: "Утерянный реквизит", description: "Найдено / списано / открытые потери" },
  { href: "/warehouse/repairs", title: "Ремонт и списание", description: "Починить или утилизировать проблемные позиции" },
  { href: "/admin/internal-consumables", title: "Внутренние расходники", description: "Учёт расходников склада" },
];

export default function WarehouseInventoryPage() {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--brand)]">Инвентарь</h1>
        <button className="ws-btn" type="button" onClick={() => { globalThis.location.href = "/"; }}>
          Назад
        </button>
      </div>
      <p className="text-sm text-[var(--muted)]">
        Управление реквизитом, подборками, пакетами, потерями, ремонтом и расходниками.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_SCENARIOS.map((scenario) => (
          <Link
            key={scenario.href}
            href={scenario.href}
            className="rounded-2xl border-2 border-violet-300 !bg-violet-100 p-4 shadow-md transition-colors hover:!bg-violet-200"
          >
            <div className="font-medium">{scenario.title}</div>
            <div className="text-sm text-[var(--muted)]">{scenario.description}</div>
          </Link>
        ))}
        {OTHER_SCENARIOS.map((scenario) => (
          <Link
            key={scenario.href}
            href={scenario.href}
            className="ws-card border border-[var(--border)] bg-white p-4 hover:bg-slate-50"
          >
            <div className="font-medium">{scenario.title}</div>
            <div className="text-sm text-[var(--muted)]">{scenario.description}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
