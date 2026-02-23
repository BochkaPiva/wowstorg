"use client";

import { FormEvent, useMemo, useState } from "react";

type Role = "GREENWICH" | "WAREHOUSE" | "ADMIN";

const presets = [
  { role: "GREENWICH" as Role, telegramId: 1000001, username: "greenwich_demo" },
  { role: "WAREHOUSE" as Role, telegramId: 1000002, username: "warehouse_demo" },
  { role: "ADMIN" as Role, telegramId: 1000003, username: "admin_demo" },
];

export default function DevLoginPage() {
  const [role, setRole] = useState<Role>("GREENWICH");
  const preset = useMemo(
    () => presets.find((item) => item.role === role) ?? presets[0],
    [role],
  );
  const [telegramId, setTelegramId] = useState<number>(preset.telegramId);
  const [username, setUsername] = useState<string>(preset.username);
  const [status, setStatus] = useState<string>("");

  function applyPreset(nextRole: Role) {
    const next = presets.find((item) => item.role === nextRole);
    setRole(nextRole);
    if (next) {
      setTelegramId(next.telegramId);
      setUsername(next.username);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("Signing in...");

    const response = await fetch("/api/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        telegramId,
        username,
      }),
    });

    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Error: ${payload.error?.message ?? "Unknown error"}`);
      return;
    }

    setStatus(`Success. Session set as ${role}.`);
  }

  async function onLogout() {
    setStatus("Logging out...");
    await fetch("/api/auth/logout", { method: "POST" });
    setStatus("Session cleared.");
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Dev Login</h1>
      <p className="text-sm text-zinc-600">
        For local testing only. In production this endpoint is disabled.
      </p>

      <form onSubmit={onSubmit} className="space-y-3 rounded border border-zinc-200 bg-white p-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Role</span>
          <select
            value={role}
            onChange={(event) => applyPreset(event.target.value as Role)}
            className="w-full rounded border border-zinc-300 px-2 py-1"
          >
            <option value="GREENWICH">GREENWICH</option>
            <option value="WAREHOUSE">WAREHOUSE</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Telegram ID</span>
          <input
            type="number"
            value={telegramId}
            onChange={(event) => setTelegramId(Number(event.target.value))}
            className="w-full rounded border border-zinc-300 px-2 py-1"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Username</span>
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="w-full rounded border border-zinc-300 px-2 py-1"
          />
        </label>

        <div className="flex gap-2">
          <button className="rounded bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700" type="submit">
            Set Session
          </button>
          <button
            className="rounded border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100"
            type="button"
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
      </form>

      {status ? <p className="text-sm text-zinc-700">{status}</p> : null}
    </section>
  );
}
