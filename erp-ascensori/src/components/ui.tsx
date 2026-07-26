"use client";

// Дребни UI градивни блокове: модал, статус-бадж, странициране.

import { useEffect, type ReactNode } from "react";
import {
  IcoChiudi,
  IcoPrecedente,
  IcoSuccessiva,
  IcoVuoto,
} from "@/components/icone";
import { STATO_LABEL, etichetta } from "@/lib/enum-labels";

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
  // StatoSdi — пътят през Sistema di Interscambio. SCARTATA е ЧЕРВЕНО, а не
  // просто „внимание": документът се смята за НЕИЗДАДЕН и часовникът тече.
  NON_INVIATA: "bg-surface-3 text-text-2",
  GENERATA: "bg-warning-subtle text-warning-text",
  CONSEGNATA: "bg-success-subtle text-success-text",
  MANCATA_CONSEGNA: "bg-warning-subtle text-warning-text",
  SCARTATA: "bg-danger-subtle text-danger-text border border-danger/30",
  ACCETTATA: "bg-success-subtle text-success-text",
  DECORSI_TERMINI: "bg-success-subtle text-success-text",
  // StatoPagamentoFattura
  NON_PAGATA: "bg-surface-3 text-text-2",
  PARZIALE: "bg-warning-subtle text-warning-text",
  // StatoContratto
  DISDETTO: "bg-surface-2 text-text-3 line-through",
  // EsitoVerifica — законовата проверка на уредбата
  POSITIVO: "bg-success-subtle text-success-text",
  CON_PRESCRIZIONI: "bg-warning-subtle text-warning-text",
  NEGATIVO: "bg-danger-subtle text-danger-text border border-danger/30",
  // StatoImpianto
  ATTIVO: "bg-success-subtle text-success-text",
  FERMO: "bg-warning-subtle text-warning-text",
  MANUTENZIONE: "bg-accent-subtle text-accent-text",
  FUORI_SERVIZIO: "bg-danger-subtle text-danger-text",
  // Спряна ПО ЗАКОН — по-силен сигнал от обикновена повреда.
  FERMO_AMMINISTRATIVO:
    "bg-danger-subtle text-danger-text border border-danger/30",
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
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${stile}`}
    >
      {etichetta(STATO_LABEL, valore)}
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
          <button
            className="btn-ghost h-8 px-2"
            onClick={onChiudi}
            aria-label="Chiudi"
          >
            <IcoChiudi />
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
        <button
          className="btn-secondary h-8 px-3"
          disabled={page <= 1}
          onClick={() => onPagina(page - 1)}
        >
          <IcoPrecedente />
          Precedente
        </button>
        <button
          className="btn-secondary h-8 px-3"
          disabled={page >= pagine}
          onClick={() => onPagina(page + 1)}
        >
          Successiva
          <IcoSuccessiva />
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
  icona = true,
}: {
  messaggio: string;
  azione?: string;
  onAzione?: () => void;
  /** Иконата се маха, когато празнотата е ГРЕШКА, не липса на данни. */
  icona?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      {icona && <IcoVuoto />}
      <p className="text-sm text-text-2">{messaggio}</p>
      {azione && onAzione && (
        <button
          className="btn-secondary inline-flex items-center gap-1.5"
          onClick={onAzione}
        >
          {azione}
        </button>
      )}
    </div>
  );
}

// ── Скелет при зареждане ────────────────────────────────────────────────────

/** Сива лента с пулс — заема мястото на съдържанието, докато то върви.
 *
 *  Текстът „Caricamento…" вместо това е най-видимият белег на вътрешен
 *  инструмент: съдържанието изскача, оформлението подскача и окото губи
 *  мястото си. Скелетът пази геометрията от първия кадър.
 *  `motion-reduce:animate-none` — пулсът е анимация, значи подлежи на
 *  предпочитанието на потребителя. */
export function Barra({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-surface-3 motion-reduce:animate-none ${className}`}
      aria-hidden
    />
  );
}

/** Скелет на таблица: заглавен ред + N реда. */
export function ScheletroTabella({
  righe = 6,
  colonne = 5,
}: {
  righe?: number;
  colonne?: number;
}) {
  return (
    <div className="p-3" role="status" aria-label="Caricamento in corso">
      <div className="mb-3 flex gap-3 border-b border-border pb-3">
        {Array.from({ length: colonne }).map((_, i) => (
          <Barra key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: righe }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 py-2.5">
          {Array.from({ length: colonne }).map((_, c) => (
            <Barra
              key={c}
              className={`h-3.5 flex-1 ${c === 0 ? "max-w-28" : ""}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Скелет на детайлна страница: заглавие + няколко картички. */
export function ScheletroDettaglio({ carte = 3 }: { carte?: number }) {
  return (
    <div role="status" aria-label="Caricamento in corso">
      <div className="mb-6">
        <Barra className="h-7 w-64" />
        <Barra className="mt-2 h-3 w-96" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-3">
        {Array.from({ length: carte }).map((_, i) => (
          <div key={i} className="card space-y-3 p-5">
            <Barra className="h-4 w-40" />
            {Array.from({ length: 4 }).map((_, j) => (
              <Barra key={j} className="h-3 w-full" />
            ))}
          </div>
        ))}
      </div>
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
        <button
          key={v}
          className={pillola(attivo === v)}
          onClick={() => onCambia(v)}
        >
          {etichetta(STATO_LABEL, v)}
          {conteggi?.[v] !== undefined && (
            <span className="ml-1 font-mono text-text-3">{conteggi[v]}</span>
          )}
        </button>
      ))}
    </div>
  );
}
