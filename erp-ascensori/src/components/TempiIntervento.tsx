"use client";

// Часовникът на спешната намеса: сигнал → пристигане → връщане в служба.
//
// Трите бутона са с ЕДНО натискане, защото се натискат от телефон, застанал
// пред уредбата. Часът може и да се впише на ръка — сигналът често идва по
// телефона в офиса, а записът се прави след това.
//
// Числото се показва като „1h 33m", не като „93 минути": гледа се под
// напрежение, при отворена шахта и звънящ телефон.

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/fetch-client";
import { durataIt, ETICHETTA_SLA, type EsitoSla, type StatoSla } from "@/lib/sla";
import { dataOraIt } from "@/lib/format";
import { IcoIntegro, IcoAttenzione } from "@/components/icone";

interface Tempi {
  segnalatoAt: string | null;
  arrivoAt: string | null;
  ripristinoAt: string | null;
}

type Campo = keyof Tempi;

const PASSI: { campo: Campo; label: string; azione: string }[] = [
  { campo: "segnalatoAt", label: "Segnalazione", azione: "Segnalato ora" },
  { campo: "arrivoAt", label: "Arrivo sul posto", azione: "Sono arrivato" },
  { campo: "ripristinoAt", label: "Rientro in servizio", azione: "Ripristinato" },
];

/** Цветът НЕ носи смисъла сам: до него винаги стои и текстът на състоянието. */
const STILE: Record<StatoSla, string> = {
  non_applicabile: "text-text-3",
  in_corso: "text-text-2",
  a_rischio: "text-warning-text",
  rispettato: "text-success-text",
  violato: "text-danger-text",
};

function Misura({
  titolo,
  m,
}: {
  titolo: string;
  m: EsitoSla["intervento"];
}) {
  if (m.stato === "non_applicabile")
    return (
      <div className="text-xs text-text-3">
        {titolo}: nessun tempo concordato a contratto
      </div>
    );
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-text-2">{titolo}:</span>
      <span className={`inline-flex items-center gap-1 font-medium ${STILE[m.stato]}`}>
        {m.stato === "violato" ? <IcoAttenzione /> : m.concluso ? <IcoIntegro /> : null}
        {ETICHETTA_SLA[m.stato]}
      </span>
      <span className="font-mono text-text-1">{durataIt(m.trascorsiMin)}</span>
      <span className="text-text-3">
        / {durataIt(m.sogliaMin)}
        {!m.concluso && m.rimanentiMin !== null && (
          <> · residuo {durataIt(m.rimanentiMin)}</>
        )}
      </span>
    </div>
  );
}

export default function TempiIntervento({ ordineId }: { ordineId: string }) {
  const [tempi, setTempi] = useState<Tempi | null>(null);
  const [sla, setSla] = useState<EsitoSla | null>(null);
  const [applicabile, setApplicabile] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const carica = useCallback(async () => {
    const { ok, dati } = await apiFetch<{
      tempi: Tempi;
      sla: EsitoSla;
      applicabile: boolean;
    }>(`/api/ordini/${ordineId}/sla`);
    if (ok) {
      setTempi(dati.tempi);
      setSla(dati.sla);
      setApplicabile(dati.applicabile);
    }
  }, [ordineId]);

  useEffect(() => {
    void carica();
  }, [carica]);

  // Докато часовник ТЕЧЕ, числото на екрана застарява. Опресняване на минута:
  // по-често е излишно (мерната единица е минута), по-рядко значи, че диспечерът
  // гледа стойност отпреди пет минути и решава по нея.
  useEffect(() => {
    if (!sla) return;
    const attivo =
      (!sla.intervento.concluso && sla.intervento.stato !== "non_applicabile") ||
      (!sla.ripristino.concluso && sla.ripristino.stato !== "non_applicabile");
    if (!attivo) return;
    const t = setInterval(() => void carica(), 60_000);
    return () => clearInterval(t);
  }, [sla, carica]);

  async function segna(campo: Campo, valore: string | null) {
    if (inCorso) return;
    setInCorso(true);
    setErrore(null);
    try {
      const { ok, dati } = await apiFetch<{ error?: string }>(
        `/api/ordini/${ordineId}/sla`,
        { method: "PATCH", body: JSON.stringify({ [campo]: valore }) },
      );
      if (!ok) {
        setErrore(dati.error ?? "Errore");
        return;
      }
      await carica();
    } finally {
      setInCorso(false);
    }
  }

  if (!tempi) return null;

  return (
    <section className="card p-5" aria-label="Tempi di intervento">
      <h2 className="mb-1 text-lg font-semibold text-text-1">
        Tempi di intervento
      </h2>
      {!applicabile && (
        <p className="mb-3 text-xs text-text-3">
          Priorità ordinaria: i tempi si registrano comunque, ma non sono
          soggetti ai termini concordati.
        </p>
      )}

      <div className="space-y-2">
        {PASSI.map((p) => (
          <div
            key={p.campo}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
          >
            <div className="min-w-0">
              <div className="text-sm text-text-1">{p.label}</div>
              <div className="text-xs text-text-3">
                {tempi[p.campo] ? dataOraIt(tempi[p.campo]!) : "non registrato"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {tempi[p.campo] ? (
                <button
                  type="button"
                  className="btn-ghost h-7 px-2 text-xs"
                  disabled={inCorso}
                  onClick={() => void segna(p.campo, null)}
                >
                  Annulla
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary h-7 px-3 text-xs"
                  disabled={inCorso}
                  onClick={() => void segna(p.campo, new Date().toISOString())}
                >
                  {p.azione}
                </button>
              )}
              <label className="sr-only" htmlFor={`t-${p.campo}-${ordineId}`}>
                {p.label} — data e ora
              </label>
              <input
                id={`t-${p.campo}-${ordineId}`}
                type="datetime-local"
                className="input h-7 w-44 text-xs"
                value={
                  tempi[p.campo]
                    ? new Date(tempi[p.campo]!).toISOString().slice(0, 16)
                    : ""
                }
                onChange={(e) =>
                  void segna(
                    p.campo,
                    e.target.value ? new Date(e.target.value).toISOString() : null,
                  )
                }
                disabled={inCorso}
              />
            </div>
          </div>
        ))}
      </div>

      {sla && (
        <div className="mt-3 space-y-1 border-t border-border pt-3">
          <Misura titolo="Intervento" m={sla.intervento} />
          <Misura titolo="Ripristino" m={sla.ripristino} />
        </div>
      )}

      {errore && (
        <p className="mt-2 text-xs text-danger-text" role="alert">
          {errore}
        </p>
      )}
    </section>
  );
}
