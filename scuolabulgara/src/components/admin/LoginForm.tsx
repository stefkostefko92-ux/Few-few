"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      if (!res.ok) {
        setError("Грешен имейл или парола.");
        setBusy(false);
        return;
      }
      // Only allow same-origin relative redirects (prevents open redirect).
      const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
      router.push(dest);
      router.refresh();
    } catch {
      setError("Мрежова грешка. Опитайте отново.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      {error && <div className="ad-err">{error}</div>}
      <div className="ad-field">
        <label htmlFor="email">Имейл</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div className="ad-field">
        <label htmlFor="password">Парола</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button className="ad-btn ad-btn--primary" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: ".4rem" }}>
        {busy ? "Влизане…" : "Вход"}
      </button>
    </form>
  );
}
