"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Customer = {
  id: string;
  name: string;
  contact: string | null;
  notes: string | null;
  isActive: boolean;
  ltv: number;
  ordersCount: number;
};

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [status, setStatus] = useState("Загрузка...");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { name: string; contact: string; notes: string; isActive: boolean }>>({});

  useEffect(() => {
    void loadCustomers("", false);
  }, []);

  async function loadCustomers(value: string, withInactive: boolean) {
    const params = new URLSearchParams();
    if (value.trim().length > 0) {
      params.set("search", value.trim());
    }
    if (withInactive) {
      params.set("includeInactive", "true");
    }
    const query = params.toString().length > 0 ? `?${params.toString()}` : "";
    const response = await fetch(`/api/customers${query}`);
    const payload = (await response.json()) as { customers?: Customer[]; error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось загрузить заказчиков."}`);
      return;
    }
    const list = Array.isArray(payload.customers) ? payload.customers : [];
    setCustomers(list);
    setDrafts(
      list.reduce<Record<string, { name: string; contact: string; notes: string; isActive: boolean }>>(
        (acc, customer) => {
          acc[customer.id] = {
            name: customer.name,
            contact: customer.contact ?? "",
            notes: customer.notes ?? "",
            isActive: customer.isActive,
          };
          return acc;
        },
        {},
      ),
    );
    setStatus(`Заказчиков: ${list.length}`);
  }

  async function createCustomer(event: FormEvent) {
    event.preventDefault();
    setBusyId("create");
    const response = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        contact: newContact.trim() || null,
        notes: newNotes.trim() || null,
        isActive: true,
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось сохранить заказчика."}`);
      setBusyId(null);
      return;
    }
    setNewName("");
    setNewContact("");
    setNewNotes("");
    await loadCustomers(search, includeInactive);
    setStatus("Заказчик сохранен.");
    setBusyId(null);
  }

  async function saveCustomer(customerId: string) {
    const draft = drafts[customerId];
    if (!draft) {
      return;
    }
    setBusyId(customerId);
    const response = await fetch(`/api/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim(),
        contact: draft.contact.trim() || null,
        notes: draft.notes.trim() || null,
        isActive: draft.isActive,
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось обновить заказчика."}`);
      setBusyId(null);
      return;
    }
    await loadCustomers(search, includeInactive);
    setStatus("Заказчик обновлен.");
    setBusyId(null);
  }

  async function deleteCustomer(customerId: string) {
    const confirmed = globalThis.confirm("Удалить заказчика? Заказчик будет убран из справочника.");
    if (!confirmed) {
      return;
    }
    setBusyId(`delete-${customerId}`);
    const response = await fetch(`/api/customers/${customerId}`, {
      method: "DELETE",
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось удалить заказчика."}`);
      setBusyId(null);
      return;
    }
    await loadCustomers(search, includeInactive);
    setStatus("Заказчик удален.");
    setBusyId(null);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Заказчики</h1>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Это та же база, что и выпадающий список «Заказчик» при создании заявки. При указании нового имени в заявке заказчик добавляется сюда автоматически.
        </p>
        <Link href="/admin" className="ws-btn">
          Назад
        </Link>
      </div>
      <p className="text-sm text-zinc-700">{status}</p>

      <form className="grid gap-2 rounded border border-zinc-200 bg-white p-3 sm:grid-cols-2" onSubmit={createCustomer}>
        <input className="rounded border border-zinc-300 px-2 py-1 text-sm" placeholder="Название (обязательно)" value={newName} onChange={(event) => setNewName(event.target.value)} />
        <input className="rounded border border-zinc-300 px-2 py-1 text-sm" placeholder="Контакт" value={newContact} onChange={(event) => setNewContact(event.target.value)} />
        <input className="rounded border border-zinc-300 px-2 py-1 text-sm sm:col-span-2" placeholder="Заметки" value={newNotes} onChange={(event) => setNewNotes(event.target.value)} />
        <button className="rounded bg-zinc-900 px-3 py-1 text-sm text-white hover:bg-zinc-700 disabled:opacity-50 sm:col-span-2" type="submit" disabled={busyId !== null}>
          {busyId === "create" ? "..." : "Сохранить"}
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <input className="min-w-[200px] flex-1 rounded border border-zinc-300 px-2 py-1 text-sm" placeholder="Поиск по названию" value={search} onChange={(event) => setSearch(event.target.value)} />
        <label className="inline-flex items-center gap-1 text-xs text-zinc-600">
          <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
          Включая неактивных
        </label>
        <button className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100" type="button" onClick={() => void loadCustomers(search, includeInactive)}>
          Найти
        </button>
      </div>

      <div className="space-y-2">
        {customers.map((customer) => {
          const draft = drafts[customer.id];
          return (
            <div key={customer.id} className="rounded border border-zinc-200 bg-white p-3">
              <div className="text-xs text-zinc-500">id: {customer.id}</div>
              <div className="text-xs text-zinc-500">
                LTV: {Math.round(customer.ltv)} ₽ • Заказов: {customer.ordersCount}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input
                  className="rounded border border-zinc-300 px-2 py-1 text-sm"
                  placeholder="Название заказчика"
                  value={draft?.name ?? customer.name}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [customer.id]: {
                        name: event.target.value,
                        contact: prev[customer.id]?.contact ?? customer.contact ?? "",
                        notes: prev[customer.id]?.notes ?? customer.notes ?? "",
                        isActive: prev[customer.id]?.isActive ?? customer.isActive,
                      },
                    }))
                  }
                />
                <input
                  className="rounded border border-zinc-300 px-2 py-1 text-sm"
                  placeholder="Контакт"
                  value={draft?.contact ?? customer.contact ?? ""}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [customer.id]: {
                        name: prev[customer.id]?.name ?? customer.name,
                        contact: event.target.value,
                        notes: prev[customer.id]?.notes ?? customer.notes ?? "",
                        isActive: prev[customer.id]?.isActive ?? customer.isActive,
                      },
                    }))
                  }
                />
                <input
                  className="rounded border border-zinc-300 px-2 py-1 text-sm sm:col-span-2"
                  placeholder="Заметки"
                  value={draft?.notes ?? customer.notes ?? ""}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [customer.id]: {
                        name: prev[customer.id]?.name ?? customer.name,
                        contact: prev[customer.id]?.contact ?? customer.contact ?? "",
                        notes: event.target.value,
                        isActive: prev[customer.id]?.isActive ?? customer.isActive,
                      },
                    }))
                  }
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <label className="inline-flex items-center gap-1 text-xs text-zinc-600">
                  <input
                    type="checkbox"
                    checked={draft?.isActive ?? customer.isActive}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [customer.id]: {
                          name: prev[customer.id]?.name ?? customer.name,
                          contact: prev[customer.id]?.contact ?? customer.contact ?? "",
                          notes: prev[customer.id]?.notes ?? customer.notes ?? "",
                          isActive: event.target.checked,
                        },
                      }))
                    }
                  />
                  Активен
                </label>
                <button
                  className="rounded border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 disabled:opacity-50"
                  onClick={() => void saveCustomer(customer.id)}
                  disabled={busyId !== null}
                  type="button"
                >
                  {busyId === customer.id ? "..." : "Обновить"}
                </button>
                <button
                  className="rounded border border-red-300 px-2 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                  onClick={() => void deleteCustomer(customer.id)}
                  disabled={busyId !== null}
                  type="button"
                >
                  {busyId === `delete-${customer.id}` ? "..." : "Удалить"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
