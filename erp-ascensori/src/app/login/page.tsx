"use client";

// Вход — италиански, с брояч на оставащите опити и съобщение при блокада.

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(false);

  async function accedi(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setCaricamento(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const dati = await res.json();
      if (!res.ok) {
        setErrore(dati.error ?? "Errore di accesso");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setErrore("Errore di rete: riprovare");
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-lg font-bold text-text-inverse">
            EA
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-1">
            ERP Ascensori Enterprise
          </h1>
          <p className="mt-1 text-sm text-text-3">Accedi al gestionale</p>
        </div>

        <form onSubmit={accedi} className="card p-6">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="input mb-4"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="input mb-4"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {errore && (
            <p role="alert" className="mb-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
              {errore}
            </p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={caricamento}>
            {caricamento ? "Accesso in corso…" : "Accedi"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-text-3">
          Carbon Stealth VCC · Accesso riservato · Schema versione 3.0
        </p>
      </div>
    </main>
  );
}
