"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Преградата пред всяка справка в следствения режим.
 *
 * Не е формалност: одиторският запис за справка изисква обосновка, а обосновка,
 * попълнена СЛЕД като си видял резултата, не е обосновка. Затова полето стои
 * пред търсенето, не след него.
 */
export default function CaseGate({ current }: { current?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/prepiska", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ justification: value }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Не успя да се запише.");
        return;
      }
      router.refresh();
    } catch {
      setError("Не успя да се запише — мрежова грешка.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm text-text-muted">
          Преписка и правно основание
        </span>
        <input
          className="field-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="ДП 123/2026, чл. 159а НПК"
          required
        />
      </label>
      <p className="text-xs text-text-faint">
        Влиза дословно във всеки запис в дневника, докато не я смениш. Пази се 12 часа.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? "Записва се…" : current ? "Смени преписката" : "Започни работа"}
      </button>
    </form>
  );
}
