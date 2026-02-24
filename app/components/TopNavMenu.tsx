"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type MenuItem = { href: string; label: string; roles?: ("GREENWICH" | "WAREHOUSE" | "ADMIN")[] };

const ALL_ITEMS: MenuItem[] = [
  { href: "/catalog", label: "Каталог", roles: ["GREENWICH"] },
  { href: "/my-orders", label: "Мои заявки", roles: ["GREENWICH"] },
  { href: "/orders/new", label: "Быстрая выдача", roles: ["WAREHOUSE", "ADMIN"] },
  { href: "/warehouse/queue", label: "Очередь склада", roles: ["WAREHOUSE", "ADMIN"] },
  { href: "/warehouse/archive", label: "Архив", roles: ["WAREHOUSE", "ADMIN"] },
  { href: "/warehouse/lost-items", label: "Утерянный реквизит", roles: ["WAREHOUSE", "ADMIN"] },
  { href: "/warehouse/repairs", label: "Ремонт и списание", roles: ["WAREHOUSE", "ADMIN"] },
  { href: "/warehouse/inventory", label: "Инвентарь", roles: ["WAREHOUSE", "ADMIN"] },
  { href: "/admin", label: "Админ", roles: ["ADMIN"] },
  { href: "/dev-login", label: "Dev-вход", roles: ["ADMIN"] },
];

function itemsForRole(role: "GREENWICH" | "WAREHOUSE" | "ADMIN" | null): MenuItem[] {
  if (!role) return [];
  return ALL_ITEMS.filter((item) => item.roles?.includes(role));
}

export default function TopNavMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"GREENWICH" | "WAREHOUSE" | "ADMIN" | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { user?: { role: "GREENWICH" | "WAREHOUSE" | "ADMIN" } } | null) => {
        if (!ignore && payload?.user) setRole(payload.user.role);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  const items = useMemo(() => itemsForRole(role), [role]);

  const activeLabel = useMemo(() => {
    const hit = items.find((item) => pathname.startsWith(item.href));
    return hit?.label ?? "Меню";
  }, [pathname, items]);

  return (
    <div className="relative">
      <button className="ws-btn" type="button" onClick={() => setOpen((prev) => !prev)}>
        ☰ {activeLabel}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-[var(--border)] bg-white p-2 shadow-lg">
          {items.length === 0 ? (
            <div className="px-3 py-2 text-sm text-[var(--muted)]">Загрузка...</div>
          ) : (
            items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm hover:bg-violet-50"
              >
                {item.label}
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
