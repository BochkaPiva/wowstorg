"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Item = {
  id: string;
  name: string;
  quantity: number;
  updatedAt: string;
};

export default function AdminInternalConsumablesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState("Загрузка...");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addQty, setAddQty] = useState(1);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const res = await fetch("/api/admin/internal-consumables");
    const data = (await res.json()) as { items?: Item[]; error?: { message?: string } };
    if (!res.ok || !data.items) {
      setStatus(data.error?.message ?? "Не удалось загрузить список.");
      return;
    }
    setItems(data.items);
    setStatus(`Позиций: ${data.items.length}`);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    const qty = Math.max(0, parseInt(newQty, 10) || 0);
    if (!name) {
      setStatus("Введите название.");
      return;
    }
    setBusyId("create");
    const res = await fetch("/api/admin/internal-consumables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, quantity: qty }),
    });
    const data = (await res.json()) as { error?: { message?: string } };
    if (!res.ok) {
      setStatus(data.error?.message ?? "Ошибка создания.");
      setBusyId(null);
      return;
    }
    setNewName("");
    setNewQty("");
    setShowAddForm(false);
    await load();
    setStatus("Позиция добавлена.");
    setBusyId(null);
  }

  async function increase(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/admin/internal-consumables/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "increase", amount: addQty }),
    });
    if (!res.ok) {
      setStatus("Ошибка прибавления.");
      setBusyId(null);
      return;
    }
    await load();
    setBusyId(null);
  }

  async function decrease(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/admin/internal-consumables/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decrease" }),
    });
    if (!res.ok) {
      setStatus("Ошибка убавления.");
      setBusyId(null);
      return;
    }
    await load();
    setBusyId(null);
  }

  async function remove(id: string) {
    if (!confirm("Удалить позицию из списка?")) return;
    setBusyId(id);
    const res = await fetch(`/api/admin/internal-consumables/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setStatus("Ошибка удаления.");
      setBusyId(null);
      return;
    }
    await load();
    setStatus("Позиция удалена.");
    setBusyId(null);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Внутренние расходники</h1>
        <Link className="ws-btn" href="/admin">
          Назад
        </Link>
      </div>
      <p className="text-sm text-zinc-600">{status}</p>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <label className="flex items-center gap-2 text-sm">
          Кол-во для прибавления:
          <input
            className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm"
            type="number"
            min={1}
            value={addQty}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setAddQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
        </label>
        <button
          type="button"
          className="ws-btn-primary"
          onClick={() => {
            setShowAddForm(true);
            setNewQty(String(addQty));
          }}
        >
          Добавить позицию
        </button>
      </div>

      {showAddForm ? (
        <form onSubmit={create} className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
          <div className="mb-2 font-medium">Новая позиция</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Название
              <input
                className="rounded border border-zinc-300 px-2 py-1"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Например: Скотч"
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Кол-во
              <input
                className="w-24 rounded border border-zinc-300 px-2 py-1"
                type="number"
                min={0}
                value={newQty}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setNewQty(e.target.value.replace(/\D/g, "") || "0")}
              />
            </label>
            <button type="submit" className="ws-btn-primary" disabled={busyId !== null}>
              Сохранить
            </button>
            <button type="button" className="ws-btn" onClick={() => setShowAddForm(false)}>
              Отмена
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="px-3 py-2 text-left font-medium">№</th>
              <th className="px-3 py-2 text-left font-medium">Название</th>
              <th className="px-3 py-2 text-left font-medium">Кол-во</th>
              <th className="px-3 py-2 text-right font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-zinc-500">
                  Нет позиций. Нажмите «Добавить позицию».
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr
                  key={item.id}
                  className={`border-b border-zinc-100 ${item.quantity === 0 ? "bg-red-50" : ""}`}
                >
                  <td className="px-3 py-2">{index + 1}</td>
                  <td className="px-3 py-2 font-medium">{item.name}</td>
                  <td className="px-3 py-2">{item.quantity}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="ws-btn mr-1"
                      onClick={() => void decrease(item.id)}
                      disabled={busyId !== null || item.quantity <= 0}
                      title="Убавить 1"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className="ws-btn mr-1"
                      onClick={() => void increase(item.id)}
                      disabled={busyId !== null}
                      title={`Прибавить ${addQty}`}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="ws-btn"
                      onClick={() => void remove(item.id)}
                      disabled={busyId !== null}
                      title="Удалить"
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
