"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Role = "GREENWICH" | "WAREHOUSE" | "ADMIN";

type User = {
  id: string;
  telegramId: string;
  username: string | null;
  role: Role;
};

const ROLES: Role[] = ["GREENWICH", "WAREHOUSE", "ADMIN"];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Загрузка...");
  const [busy, setBusy] = useState<string | null>(null);
  const [newTelegramId, setNewTelegramId] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newRole, setNewRole] = useState<Role>("GREENWICH");
  const [drafts, setDrafts] = useState<Record<string, { username: string; role: Role }>>({});

  useEffect(() => {
    void loadUsers("");
  }, []);

  async function loadUsers(value: string) {
    const query = value.trim().length > 0 ? `?search=${encodeURIComponent(value.trim())}` : "";
    const response = await fetch(`/api/admin/users${query}`);
    const payload = (await response.json()) as { users?: User[]; error?: { message?: string } };
    if (!response.ok || !payload.users) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось загрузить пользователей."}`);
      return;
    }
    setUsers(payload.users);
    setDrafts(
      payload.users.reduce<Record<string, { username: string; role: Role }>>((acc, user) => {
        acc[user.id] = { username: user.username ?? "", role: user.role };
        return acc;
      }, {}),
    );
    setStatus(`Пользователей: ${payload.users.length}`);
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setBusy("create");
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegramId: newTelegramId.trim(),
        username: newUsername.trim() || null,
        role: newRole,
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось сохранить пользователя."}`);
      setBusy(null);
      return;
    }
    setNewTelegramId("");
    setNewUsername("");
    setNewRole("GREENWICH");
    await loadUsers(search);
    setStatus("Пользователь сохранен.");
    setBusy(null);
  }

  async function saveUser(userId: string) {
    const draft = drafts[userId];
    if (!draft) {
      return;
    }
    setBusy(userId);
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: draft.username.trim() || null,
        role: draft.role,
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось обновить пользователя."}`);
      setBusy(null);
      return;
    }
    await loadUsers(search);
    setStatus("Пользователь обновлен.");
    setBusy(null);
  }

  async function deleteUser(userId: string) {
    const confirmed = globalThis.confirm("Удалить пользователя? Это действие необратимо.");
    if (!confirmed) {
      return;
    }
    setBusy(`delete-${userId}`);
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось удалить пользователя."}`);
      setBusy(null);
      return;
    }
    await loadUsers(search);
    setStatus("Пользователь удален.");
    setBusy(null);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Доступы пользователей</h1>
        <Link href="/admin" className="text-sm text-zinc-600 hover:text-zinc-900">
          Назад в админку
        </Link>
      </div>
      <p className="text-sm text-zinc-700">{status}</p>

      <form className="grid gap-2 rounded border border-zinc-200 bg-white p-3 sm:grid-cols-[1fr_1fr_130px_auto]" onSubmit={createUser}>
        <input className="rounded border border-zinc-300 px-2 py-1 text-sm" placeholder="Telegram ID" value={newTelegramId} onChange={(event) => setNewTelegramId(event.target.value)} />
        <input className="rounded border border-zinc-300 px-2 py-1 text-sm" placeholder="username" value={newUsername} onChange={(event) => setNewUsername(event.target.value)} />
        <select className="rounded border border-zinc-300 px-2 py-1 text-sm" value={newRole} onChange={(event) => setNewRole(event.target.value as Role)}>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <button className="rounded bg-zinc-900 px-3 py-1 text-sm text-white hover:bg-zinc-700 disabled:opacity-50" type="submit" disabled={busy !== null}>
          {busy === "create" ? "..." : "Сохранить"}
        </button>
      </form>

      <div className="flex items-center gap-2">
        <input className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" placeholder="Поиск по username или telegram ID" value={search} onChange={(event) => setSearch(event.target.value)} />
        <button className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100" type="button" onClick={() => void loadUsers(search)}>
          Найти
        </button>
      </div>

      <div className="space-y-2">
        {users.map((user) => {
          const draft = drafts[user.id];
          return (
            <div key={user.id} className="rounded border border-zinc-200 bg-white p-3">
              <div className="text-xs text-zinc-500">id: {user.id} | tg: {user.telegramId}</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_130px_auto_auto]">
                <input
                  className="rounded border border-zinc-300 px-2 py-1 text-sm"
                  value={draft?.username ?? ""}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [user.id]: {
                        username: event.target.value,
                        role: prev[user.id]?.role ?? user.role,
                      },
                    }))
                  }
                />
                <select
                  className="rounded border border-zinc-300 px-2 py-1 text-sm"
                  value={draft?.role ?? user.role}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [user.id]: {
                        username: prev[user.id]?.username ?? user.username ?? "",
                        role: event.target.value as Role,
                      },
                    }))
                  }
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <button
                  className="rounded border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 disabled:opacity-50"
                  onClick={() => void saveUser(user.id)}
                  disabled={busy !== null}
                  type="button"
                >
                  {busy === user.id ? "..." : "Обновить"}
                </button>
                <button
                  className="rounded border border-red-300 px-2 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                  onClick={() => void deleteUser(user.id)}
                  disabled={busy !== null}
                  type="button"
                >
                  {busy === `delete-${user.id}` ? "..." : "Удалить"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
