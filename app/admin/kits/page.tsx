"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Kit = {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  isActive: boolean;
  lines: Array<{
    id: string;
    itemId: string;
    defaultQty: number;
  }>;
};

type Item = {
  id: string;
  name: string;
};

export default function AdminKitsPage() {
  const [kits, setKits] = useState<Kit[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState("Загрузка...");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCoverImageUrl, setNewCoverImageUrl] = useState("");
  const [newLines, setNewLines] = useState<Array<{ itemId: string; defaultQty: number }>>([
    { itemId: "", defaultQty: 1 },
  ]);

  const [selectedKitId, setSelectedKitId] = useState("");
  const [draft, setDraft] = useState<{
    name: string;
    description: string;
    coverImageUrl: string;
    isActive: boolean;
    lines: Array<{ itemId: string; defaultQty: number }>;
  } | null>(null);

  useEffect(() => {
    void Promise.all([loadKits(), loadItems()]);
  }, []);

  async function loadKits() {
    const response = await fetch("/api/admin/catalog/kits");
    const payload = (await response.json()) as { kits?: Kit[]; error?: { message?: string } };
    if (!response.ok || !payload.kits) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось загрузить пакеты."}`);
      return;
    }
    setKits(payload.kits);
    setStatus(`Пакетов: ${payload.kits.length}`);
  }

  async function loadItems() {
    const response = await fetch("/api/admin/catalog/items?limit=500");
    const payload = (await response.json()) as { items?: Item[]; error?: { message?: string } };
    if (!response.ok || !payload.items) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось загрузить позиции."}`);
      return;
    }
    setItems(payload.items.map((item) => ({ id: item.id, name: item.name })));
  }

  function addNewLine() {
    setNewLines((prev) => [...prev, { itemId: "", defaultQty: 1 }]);
  }

  function updateNewLine(index: number, patch: Partial<{ itemId: string; defaultQty: number }>) {
    setNewLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function createKit(event: FormEvent) {
    event.preventDefault();
    setBusyId("create");
    const lines = newLines
      .filter((line) => line.itemId && line.defaultQty > 0)
      .map((line) => ({ itemId: line.itemId, defaultQty: line.defaultQty }));
    const response = await fetch("/api/admin/catalog/kits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        description: newDescription.trim() || null,
        coverImageUrl: newCoverImageUrl.trim() || null,
        lines,
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось создать пакет."}`);
      setBusyId(null);
      return;
    }
    setNewName("");
    setNewDescription("");
    setNewCoverImageUrl("");
    setNewLines([{ itemId: "", defaultQty: 1 }]);
    await loadKits();
    setStatus("Пакет создан.");
    setBusyId(null);
  }

  function selectKit(kitId: string) {
    setSelectedKitId(kitId);
    const kit = kits.find((entry) => entry.id === kitId);
    if (!kit) {
      setDraft(null);
      return;
    }
    setDraft({
      name: kit.name,
      description: kit.description ?? "",
      coverImageUrl: kit.coverImageUrl ?? "",
      isActive: kit.isActive,
      lines: kit.lines.map((line) => ({
        itemId: line.itemId,
        defaultQty: line.defaultQty,
      })),
    });
  }

  function updateDraftLine(index: number, patch: Partial<{ itemId: string; defaultQty: number }>) {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        lines: prev.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
      };
    });
  }

  async function saveKit() {
    if (!selectedKitId || !draft) {
      return;
    }
    setBusyId(selectedKitId);
    const lines = draft.lines
      .filter((line) => line.itemId && line.defaultQty > 0)
      .map((line) => ({ itemId: line.itemId, defaultQty: line.defaultQty }));
    const response = await fetch(`/api/admin/catalog/kits/${selectedKitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        coverImageUrl: draft.coverImageUrl.trim() || null,
        isActive: draft.isActive,
        lines,
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось обновить пакет."}`);
      setBusyId(null);
      return;
    }
    await loadKits();
    setStatus("Пакет обновлен.");
    setBusyId(null);
  }

  async function deleteKit(kitId: string) {
    const confirmed = globalThis.confirm("Удалить пакет? Он исчезнет из выбора при создании заявки.");
    if (!confirmed) {
      return;
    }
    setBusyId(`delete-${kitId}`);
    const response = await fetch(`/api/admin/catalog/kits/${kitId}`, {
      method: "DELETE",
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось удалить пакет."}`);
      setBusyId(null);
      return;
    }
    if (selectedKitId === kitId) {
      setSelectedKitId("");
      setDraft(null);
    }
    await loadKits();
    setStatus("Пакет удален.");
    setBusyId(null);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--brand)]">Пакеты</h1>
        <Link href="/warehouse/inventory" className="ws-btn">
          Назад
        </Link>
      </div>
      <p className="text-sm text-[var(--muted)]">{status}</p>

      <form className="ws-card space-y-4 p-4" onSubmit={createKit}>
        <h2 className="text-sm font-medium text-[var(--foreground)]">Добавить новый пакет</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="sm:col-span-3">
            <span className="mb-1 block text-xs text-[var(--muted)]">Название пакета</span>
            <input
              className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
          </label>
          <label className="sm:col-span-3">
            <span className="mb-1 block text-xs text-[var(--muted)]">Описание (необязательно)</span>
            <input
              className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
            />
          </label>
          <label className="sm:col-span-3">
            <span className="mb-1 block text-xs text-[var(--muted)]">URL обложки (необязательно)</span>
            <input
              className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
              value={newCoverImageUrl}
              onChange={(event) => setNewCoverImageUrl(event.target.value)}
            />
          </label>
        </div>
        <div className="space-y-2">
          <span className="block text-xs text-[var(--muted)]">Состав пакета (позиция и количество)</span>
          {newLines.map((line, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_120px]">
              <label>
                <span className="mb-1 block text-xs text-[var(--muted)]">Позиция</span>
                <select className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" value={line.itemId} onChange={(event) => updateNewLine(index, { itemId: event.target.value })}>
                  <option value="">— выбрать —</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs text-[var(--muted)]">Кол-во</span>
                <input className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" type="number" min={1} value={line.defaultQty} onChange={(event) => updateNewLine(index, { defaultQty: Number(event.target.value) })} />
              </label>
            </div>
          ))}
          <button type="button" className="ws-btn text-sm" onClick={addNewLine}>
            + Добавить позицию в пакет
          </button>
        </div>
        <button className="ws-btn-primary disabled:opacity-50" type="submit" disabled={busyId !== null}>
          {busyId === "create" ? "..." : "Создать пакет"}
        </button>
      </form>

      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        <div className="ws-card max-h-80 overflow-auto p-0">
          {kits.map((kit) => (
            <button
              key={kit.id}
              className={`block w-full border-b border-[var(--border)] px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-violet-50 ${
                selectedKitId === kit.id ? "bg-violet-50 font-medium" : ""
              }`}
              onClick={() => selectKit(kit.id)}
              type="button"
            >
              <div>{kit.name}</div>
              <div className="text-xs text-[var(--muted)]">{kit.id}</div>
            </button>
          ))}
        </div>

        {draft ? (
          <div className="ws-card space-y-4 p-4">
            <h2 className="text-sm font-medium text-[var(--foreground)]">Редактировать пакет</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs text-[var(--muted)]">Название</span>
                <input className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </label>
              <label className="flex items-center gap-2 sm:col-span-2">
                <input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} className="rounded border-[var(--border)]" />
                <span className="text-sm text-[var(--muted)]">Пакет активен (отображается в каталоге)</span>
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs text-[var(--muted)]">Описание</span>
                <input className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs text-[var(--muted)]">URL обложки</span>
                <input className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" value={draft.coverImageUrl} onChange={(event) => setDraft({ ...draft, coverImageUrl: event.target.value })} />
              </label>
            </div>

            <div className="space-y-2">
              <span className="block text-xs text-[var(--muted)]">Состав пакета</span>
              {draft.lines.map((line, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[1fr_120px]">
                  <label>
                    <span className="mb-1 block text-xs text-[var(--muted)]">Позиция</span>
                    <select className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" value={line.itemId} onChange={(event) => updateDraftLine(index, { itemId: event.target.value })}>
                      <option value="">— выбрать —</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs text-[var(--muted)]">Кол-во</span>
                    <input className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" type="number" min={1} value={line.defaultQty} onChange={(event) => updateDraftLine(index, { defaultQty: Number(event.target.value) })} />
                  </label>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="ws-btn-primary disabled:opacity-50" type="button" onClick={() => void saveKit()} disabled={busyId !== null}>
                {busyId === selectedKitId ? "..." : "Сохранить пакет"}
              </button>
              <button
                className="ws-btn border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                type="button"
                onClick={() => void deleteKit(selectedKitId)}
                disabled={busyId !== null}
              >
                {busyId === `delete-${selectedKitId}` ? "..." : "Удалить пакет"}
              </button>
            </div>
          </div>
        ) : (
          <div className="ws-card flex items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)] p-8 text-sm text-[var(--muted)]">
            Выберите пакет в списке слева
          </div>
        )}
      </div>
    </section>
  );
}
