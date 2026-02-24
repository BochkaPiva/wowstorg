"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

type MenuItem = { href: string; label: string };

const ITEMS: MenuItem[] = [
  { href: "/catalog", label: "Каталог" },
  { href: "/my-orders", label: "Мои заявки" },
  { href: "/orders/new", label: "Быстрая выдача" },
  { href: "/warehouse/queue", label: "Очередь склада" },
  { href: "/warehouse/archive", label: "Архив" },
  { href: "/warehouse/inventory", label: "Инвентарь" },
  { href: "/admin", label: "Админ" },
  { href: "/dev-login", label: "Dev-вход" },
];

export default function TopNavMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const activeLabel = useMemo(() => {
    const hit = ITEMS.find((item) => pathname.startsWith(item.href));
    return hit?.label ?? "Меню";
  }, [pathname]);

  return (
    <div className="relative">
      <button className="ws-btn" type="button" onClick={() => setOpen((prev) => !prev)}>
        ☰ {activeLabel}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-[var(--border)] bg-white p-2 shadow-lg">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm hover:bg-violet-50"
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
