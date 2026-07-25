"use client";

// Дребни UI градивни блокове: модал, статус-бадж, странициране.

import { useEffect, type ReactNode } from "react";

// ── Бадж за статуси (цветове от дизайн системата) ───────────────────────────

const STILE_BADGE: Record<string, string> = {
  // StatoOrdine
  BOZZA: "bg-surface-3 text-text-2",
  EMESSO: "bg-accent-subtle text-accent-text",
  CONFERMATO: "bg-accent-subtle text-accent-text",
  IN_LAVORO: "bg-warning-subtle text-warning-text",
  SOSPESO: "bg-surface-3 text-text-2",
  COMPLETATO: "bg-success-subtle text-success-text",
  CHIUSO: "border border-border-strong bg-transparent text-text-3",
  CONTESTATO: "bg-danger-subtle text-danger-text border border-danger/30",
  ANNULLATO: "bg-surface-2 text-text-3 line-through",
  // StatoPreventivo
  INVIATO: "bg-accent-subtle text-accent-text",
  APPROVATO: "bg-success-subtle text-success-text",
  RIFIUTATO: "bg-danger-subtle text-danger-text",
  SCADUTO: "bg-warning-subtle text-warning-text",
  // StatoFattura
  EMESSA: "bg-accent-subtle text-accent-text",
  INVIATA: "bg-accent-subtle text-accent-text",
  PAGATA: "bg-success-subtle text-success-text",
  SCADUTA: "bg-danger-subtle text-danger-text",
  STORNATA: "bg-surface-2 text-text-3 line-through",
  // StatoImpianto
  ATTIVO: "bg-success-subtle text-success-text",
  FERMO: "bg-warning-subtle text-warning-text",
  MANUTENZIONE: "bg-accent-subtle text-accent-text",
  FUORI_SERVIZIO: "bg-danger-subtle text-danger-text",
  DISMESSO: "bg-surface-2 text-text-3",
  // Automezzi
  verde: "bg-success-subtle text-success-text",
  giallo: "bg-warning-subtle text-warning-text",
  rosso: "bg-danger-subtle text-danger-text",
  // Priorità
  ORDINARIA: "bg-surface-3 text-text-2",
  URGENTE: "bg-warning-subtle text-warning-text",
  EMERGENZA: "bg-danger-subtle text-danger-text",
};

export function Badge({ valore }: { valore: string }) {
  const stile = STILE_BADGE[valore] ?? "bg-surface-3 text-text-2";
  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${stile}`}>
      {valore.replaceAll("_", " ")}
    </span>
  );
}

// ── Модал ───────────────────────────────────────────────────────────────────

export function Modale({
  titolo,
  aperto,
  onChiudi,
  children,
  largo,
}: {
  titolo: string;
  aperto: boolean;
  onChiudi: () => void;
  children: ReactNode;
  largo?: boolean;
}) {
  useEffect(() => {
    if (!aperto) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onChiudi();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [aperto, onChiudi]);

  if (!aperto) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16 dark:bg-black/60"
      onMouseDown={(e) => e.target === e.currentTarget && onChiudi()}
      role="dialog"
      aria-modal="true"
      aria-label={titolo}
    >
      <div
        className={`w-full ${largo ? "max-w-3xl" : "max-w-xl"} rounded-xl border border-border bg-surface p-6 shadow-lg`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-1">{titolo}</h2>
          <button className="btn-ghost h-8 px-2" onClick={onChiudi} aria-label="Chiudi">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Странициране ────────────────────────────────────────────────────────────

export function Paginazione({
  page,
  size,
  totale,
  onPagina,
}: {
  page: number;
  size: number;
  totale: number;
  onPagina: (p: number) => void;
}) {
  const pagine = Math.max(1, Math.ceil(totale / size));
  if (pagine <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-border px-3 py-2 text-sm text-text-2">
      <span>
        {totale} risultati · pagina {page} di {pagine}
      </span>
      <div className="flex gap-2">
        <button className="btn-secondary h-8 px-3" disabled={page <= 1} onClick={() => onPagina(page - 1)}>
          ← Precedente
        </button>
        <button
          className="btn-secondary h-8 px-3"
          disabled={page >= pagine}
          onClick={() => onPagina(page + 1)}
        >
          Successiva →
        </button>
      </div>
    </div>
  );
}

/** Празно състояние с действие до текста — окото не пътува до бутона горе-дясно. */
export function Vuoto({
  messaggio,
  azione,
  onAzione,
}: {
  messaggio: string;
  azione?: string;
  onAzione?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-sm text-text-2">{messaggio}</p>
      {azione && onAzione && (
        <button className="btn-secondary" onClick={onAzione}>
          {azione}
        </button>
      )}
    </div>
  );
}

/** Филтър-хапчета по статус — без тях филтрирането не съществува за потребителя. */
export function FiltriStato({
  valori,
  attivo,
  conteggi,
  onCambia,
}: {
  valori: readonly string[];
  attivo: string;
  conteggi?: Record<string, number>;
  onCambia: (v: string) => void;
}) {
  const pillola = (selezionato: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition-colors duration-150 ${
      selezionato
        ? "border-transparent bg-accent-subtle font-medium text-accent-text"
        : "border-border text-text-2 hover:bg-surface-2"
    }`;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button className={pillola(attivo === "")} onClick={() => onCambia("")}>
        Tutti
      </button>
      {valori.map((v) => (
        <button key={v} className={pillola(attivo === v)} onClick={() => onCambia(v)}>
          {v.replaceAll("_", " ")}
          {conteggi?.[v] !== undefined && (
            <span className="ml-1 font-mono text-text-3">{conteggi[v]}</span>
          )}
        </button>
      ))}
    </div>
  );
}
