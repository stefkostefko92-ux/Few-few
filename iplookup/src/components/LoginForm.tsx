"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginForm() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vhod", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, password }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Входът не успя.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Входът не успя — мрежова грешка.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm text-text-muted">Служебен идентификатор</span>
        <input
          className="field-input"
          value={id}
          onChange={(event) => setId(event.target.value)}
          autoComplete="username"
          required
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm text-text-muted">Парола</span>
        <input
          type="password"
          className="field-input"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "Проверява се…" : "Вход"}
      </button>
    </form>
  );
}
