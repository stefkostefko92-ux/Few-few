"use client";

import { useState } from "react";

/**
 * Замразява справката за преписка.
 *
 * Отделно действие, не автоматично: не всяка справка влиза в дело, а всеки
 * замразен артефакт е задължение за съхранение.
 */
export default function FreezeButton({ ip }: { ip: string }) {
  const [state, setState] = useState<{ hash: string; path: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function freeze() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/zamrazi", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ip }),
      });
      const payload = (await response.json()) as { hash?: string; path?: string; error?: string };
      if (!response.ok || !payload.hash || !payload.path) {
        setError(payload.error ?? "Замразяването не успя.");
        return;
      }
      setState({ hash: payload.hash, path: payload.path });
    } catch {
      setError("Замразяването не успя — мрежова грешка.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-3 text-sm text-text-muted">
        Записва суровите отговори на всички източници заедно с часа, версията на офлайн базата и
        собствения си хеш. Справката се прави наново на сървъра — артефакт, съставен от данни на
        браузъра, не доказва нищо.
      </p>
      {state ? (
        <div className="rounded-lg border border-ok p-3 text-sm">
          <p className="font-semibold text-ok">Замразено.</p>
          <p className="mt-1 break-all text-text-muted">
            SHA-256: <span className="value-mono">{state.hash}</span>
          </p>
          <p className="mt-1 break-all text-text-faint">{state.path}</p>
        </div>
      ) : (
        <button type="button" className="btn-primary" onClick={freeze} disabled={busy}>
          {busy ? "Замразява се…" : "Замрази за преписка"}
        </button>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
