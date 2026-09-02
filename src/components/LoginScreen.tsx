"use client";

import { FormEvent, useState } from "react";

export default function LoginScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      onUnlocked();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[#0b141a] px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-3xl border border-[#2a3942] bg-[#111b21] p-6 shadow-2xl"
      >
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-[#00a884] text-2xl font-bold text-[#111b21]">
          D
        </div>
        <h1 className="text-center text-xl font-semibold text-white">Deft Inbox</h1>
        <p className="mt-1 text-center text-sm text-[#8696a0]">
          Deft Decor · official WhatsApp Cloud API
        </p>
        <label className="mt-6 grid gap-2 text-xs text-[#8696a0]">
          Operator PIN
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            className="rounded-xl bg-[#2a3942] px-4 py-3 text-center text-lg tracking-[0.4em] text-white outline-none"
          />
        </label>
        {error && <p className="mt-3 text-center text-sm text-rose-300">{error}</p>}
        <button
          disabled={busy || !pin}
          className="mt-5 w-full rounded-xl bg-[#00a884] py-3 text-sm font-semibold text-[#111b21] disabled:opacity-40"
        >
          Unlock inbox
        </button>
      </form>
    </div>
  );
}
