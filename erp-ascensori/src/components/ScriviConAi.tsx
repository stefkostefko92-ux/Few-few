"use client";

// „Scrivi con l'AI“ — превръща бележката на техника в изречение за документа.
//
// Близнак на `CompilaConAi`, но с обратна посока: там документ влиза и полета
// излизат, тук бележка влиза и проза излиза. Държи същите три правила:
//
//   1. Нищо не се записва само. Текстът се показва, човек натиска „Usa questo
//      testo" — и чак тогава влиза в полето. Ако полето вече има съдържание,
//      бутонът го КАЗВА, преди да го замени.
//   2. Изключената функция не оставя следа в интерфейса. Бутон, който само дава
//      грешка, е по-лош от липсващ бутон.
//   3. Разкриването е ПРЕДИ изпращането, не след него: кой получава текста
//      пише над полето за въвеждане, докато то е още празно (чл. 5(1)(а) и
//      чл. 12(1) ОРЗД).

import { useEffect, useId, useState } from "react";
import { IcoAttenzione, IcoNota, IcoFatto, IcoAi } from "@/components/icone";
import { MAX_INGRESSO } from "@/lib/ai/testo";

interface StatoAi {
  attiva: boolean;
  fornitore: string;
  compiti: Record<string, { titolo: string; ingressoAtteso: string }>;
}

/** Кешира отговора: състоянието е едно за сесията, не за всяко поле. */
let statoCache: Promise<StatoAi | null> | null = null;
function caricaStato(): Promise<StatoAi | null> {
  statoCache ??= fetch("/api/ai/testo")
    .then((r) => (r.ok ? (r.json() as Promise<StatoAi>) : null))
    .catch(() => null);
  return statoCache;
}

export default function ScriviConAi({
  compito,
  valoreAttuale,
  onTesto,
}: {
  /** Името на задачата в сървърния регистър (`descrizione-voce`…). */
  compito: string;
  /** Какво вече пише в полето — за да се предупреди при замяна. */
  valoreAttuale?: string;
  onTesto: (testo: string) => void;
}) {
  const idBase = useId();
  const [stato, setStato] = useState<StatoAi | null>(null);
  const [pronto, setPronto] = useState(false);
  const [aperto, setAperto] = useState(false);
  const [appunti, setAppunti] = useState("");
  const [proposta, setProposta] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => {
    let vivo = true;
    void caricaStato().then((s) => {
      if (!vivo) return;
      setStato(s);
      setPronto(true);
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (!pronto || !stato?.attiva || !stato.compiti[compito]) return null;
  const info = stato.compiti[compito];
  const occupato = Boolean(valoreAttuale?.trim());

  async function genera() {
    setErrore(null);
    setProposta(null);
    setInCorso(true);
    try {
      const res = await fetch("/api/ai/testo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compito, appunti }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        testo?: string;
        error?: string;
      };
      if (!res.ok) {
        setErrore(d.error ?? "Errore nella composizione del testo.");
        return;
      }
      setProposta(d.testo ?? "");
    } finally {
      setInCorso(false);
    }
  }

  function usa() {
    if (proposta === null) return;
    onTesto(proposta);
    setAperto(false);
    setProposta(null);
    setAppunti("");
  }

  if (!aperto)
    return (
      <button
        type="button"
        className="btn-ghost mt-1 h-7 gap-1.5 px-2 text-xs"
        onClick={() => setAperto(true)}
      >
        <IcoAi />
        Scrivi con l&apos;AI
      </button>
    );

  return (
    <div className="mt-2 rounded-md border border-border bg-surface-2 p-3">
      <label className="label" htmlFor={`${idBase}-appunti`}>
        {info.titolo}
      </label>
      <p className="mb-1 text-xs text-text-3">{info.ingressoAtteso}</p>
      {stato.fornitore && (
        <p className="mb-2 text-xs text-warning-text">
          Gli appunti saranno inviati a {stato.fornitore} per la riformulazione.
        </p>
      )}
      <textarea
        id={`${idBase}-appunti`}
        className="input min-h-20 py-2"
        maxLength={MAX_INGRESSO}
        value={appunti}
        placeholder="cambio fune trazione 8mm, 2 tecnici, 3 ore, impianto fermo"
        onChange={(e) => setAppunti(e.target.value)}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary h-8 px-3 text-xs"
          disabled={inCorso || appunti.trim().length < 3}
          onClick={() => void genera()}
        >
          {inCorso ? "Composizione…" : "Componi"}
        </button>
        <button
          type="button"
          className="btn-ghost h-8 px-3 text-xs"
          onClick={() => {
            setAperto(false);
            setProposta(null);
            setErrore(null);
          }}
        >
          Annulla
        </button>
      </div>

      {errore && (
        <p
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text"
        >
          <IcoAttenzione />
          {errore}
        </p>
      )}

      {proposta !== null && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-2 flex items-start gap-2 text-xs text-warning-text">
            <IcoNota />
            <span>
              Testo proposto da {stato.fornitore}: rileggerlo prima di salvare.
              Il documento resta di chi lo firma.
            </span>
          </p>
          {/* Предложението е РЕДАКТИРУЕМО. Текст „вземи или остави" кара
              оператора да приеме почти вярно изречение, вместо да го оправи. */}
          <textarea
            className="input min-h-20 py-2"
            aria-label="Testo proposto"
            value={proposta}
            onChange={(e) => setProposta(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary mt-2 inline-flex h-8 items-center gap-1.5 px-3 text-xs"
            disabled={!proposta.trim()}
            onClick={usa}
          >
            <IcoFatto />
            {occupato ? "Sostituisci il testo attuale" : "Usa questo testo"}
          </button>
        </div>
      )}
    </div>
  );
}
