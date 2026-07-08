"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";

export default function AdminLogin() {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, pass }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Входът не успя.");
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Входът не успя.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-4 py-16">
      <Logo className="h-14 w-14" />
      <h1 className="font-display mt-4 text-2xl font-bold">Админ вход</h1>
      <form onSubmit={submit} className="card-warm mt-6 w-full space-y-4 p-6">
        <div>
          <label htmlFor="user" className="field-label">Потребител</label>
          <input
            id="user"
            className="field-input"
            autoComplete="username"
            value={user}
            onChange={(e) => setUser(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="pass" className="field-label">Парола</label>
          <input
            id="pass"
            type="password"
            className="field-input"
            autoComplete="current-password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm font-semibold text-tera-dark">{error}</p>
        )}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? "Влизане…" : "Влез"}
        </button>
      </form>
    </div>
  );
}
