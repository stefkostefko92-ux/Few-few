"use client";

// Детайл на preventivo: редове + статус + тотали (сървърно преизчислени).

import { STATO_LABEL } from "@/lib/enum-labels";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Badge, ScheletroDettaglio } from "@/components/ui";
import { IcoIndietro, IcoStampa } from "@/components/icone";
import VociEditor, { type VoceRiga } from "@/components/VociEditor";
import { euro, dataIt } from "@/lib/format";
import { apiFetch } from "@/lib/fetch-client";
import { TRANSIZIONI_PREVENTIVO } from "@/lib/regole-fiscali";

interface Preventivo {
  id: string;
  numero: string;
  stato: string;
  oggetto: string;
  descrizione: string | null;
  totaleNetto: string;
  totaleIva: string;
  totaleLordo: string;
  validitaGiorni: number;
  createdAt: string;
  impianto: { matricola: string; indirizzo: string | null } | null;
  amministratore: {
    nome: string;
    cognome: string | null;
    ragioneSociale: string | null;
  } | null;
  voci: VoceRiga[];
  ordiniLavoro: { id: string; numero: string; stato: string }[];
  /** Само от DIREZIONE нагоре (икономически данни). */
  fatture?: {
    id: string;
    numero: string;
    stato: string;
    totaleLordo: string;
  }[];
}

/** Редовете се менят само докато офертата не е приета или отказана. */
const STATI_MODIFICABILI = ["BOZZA", "INVIATO"];

export default function Pagina() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<Preventivo | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [erroreAzione, setErroreAzione] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const carica = useCallback(async () => {
    const r = await apiFetch<Preventivo & { error?: string }>(
      `/api/preventivi/${id}`,
    );
    if (!r.ok) {
      setErrore(r.dati.error ?? "Preventivo non trovato");
      return;
    }
    setP(r.dati);
  }, [id]);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function cambiaStato(stato: string) {
    if (inCorso || !p || stato === p.stato) return;
    // APPROVATO и RIFIUTATO са крайни: от одобрената оферта се ражда ордин.
    if (
      (stato === "APPROVATO" || stato === "RIFIUTATO") &&
      !confirm(
        `Segnare il preventivo come «${STATO_LABEL[stato]}»? Lo stato è definitivo.`,
      )
    )
      return;
    setInCorso(true);
    setErroreAzione(null);
    const r = await apiFetch<{ error?: string }>(
      `/api/preventivi/${id}/stato`,
      { method: "PATCH", body: JSON.stringify({ stato }) },
    );
    setInCorso(false);
    if (!r.ok) {
      setErroreAzione(r.dati.error ?? "Errore");
      return;
    }
    void carica();
  }

  /** Оферта → ордин/фактура: новият документ се отваря веднага. */
  async function genera(cosa: "ordine" | "fattura") {
    if (inCorso || !p) return;
    if (
      cosa === "fattura" &&
      p.fatture?.some((f) => f.stato !== "STORNATA") &&
      !confirm(
        `Esistono già fatture per questo preventivo (${p.fatture
          .map((f) => f.numero)
          .join(", ")}). Creare un'altra fattura in bozza con tutte le righe?`,
      )
    )
      return;
    setInCorso(true);
    setErroreAzione(null);
    const r = await apiFetch<{ id?: string; error?: string }>(
      `/api/preventivi/${id}/${cosa}`,
      { method: "POST" },
    );
    setInCorso(false);
    if (!r.ok || !r.dati.id) {
      setErroreAzione(r.dati.error ?? "Errore");
      return;
    }
    router.push(`/${cosa === "ordine" ? "ordini" : "fatture"}/${r.dati.id}`);
  }

  if (errore) return <p className="text-text-3">{errore}</p>;
  if (!p) return <ScheletroDettaglio />;

  const destinatario = p.amministratore
    ? (p.amministratore.ragioneSociale ??
      `${p.amministratore.nome} ${p.amministratore.cognome ?? ""}`)
    : "—";

  return (
    <div>
      <button
        className="btn-ghost mb-4 h-8 px-2 text-xs"
        onClick={() => router.push("/preventivi")}
      >
        <IcoIndietro />
        Preventivi
      </button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-text-1">
            {p.numero}
          </h1>
          <p className="mt-1 text-sm text-text-2">{p.oggetto}</p>
          <p className="mt-1 text-xs text-text-3">
            {destinatario} · impianto {p.impianto?.matricola ?? "—"} · creato il{" "}
            {dataIt(p.createdAt)} · validità {p.validitaGiorni} gg
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            className="btn-secondary inline-flex items-center gap-1.5"
            href={`/api/preventivi/${id}/pdf`}
            target="_blank"
            rel="noopener"
          >
            <IcoStampa />
            Stampa
          </a>
          <Badge valore={p.stato} />
          {/* Само позволените преходи: иначе изборът даваше 409. */}
          {(TRANSIZIONI_PREVENTIVO[
            p.stato as keyof typeof TRANSIZIONI_PREVENTIVO
          ]?.length ?? 0) > 0 && (
            <select
              className="input w-44"
              value=""
              disabled={inCorso}
              onChange={(e) => void cambiaStato(e.target.value)}
              aria-label="Cambia stato"
            >
              <option value="" disabled>
                Cambia stato…
              </option>
              {TRANSIZIONI_PREVENTIVO[
                p.stato as keyof typeof TRANSIZIONI_PREVENTIVO
              ].map((s) => (
                <option key={s} value={s}>
                  {STATO_LABEL[s] ?? s}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {erroreAzione && (
        <p
          role="alert"
          className="mb-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text"
        >
          {erroreAzione}
        </p>
      )}

      <div className="card mb-6 p-5">
        <h2 className="mb-4 text-lg font-semibold text-text-1">Voci</h2>
        <VociEditor
          api={`/api/preventivi/${id}/voci`}
          voci={p.voci}
          conPrezzi
          onCambiato={() => void carica()}
          bloccato={
            STATI_MODIFICABILI.includes(p.stato)
              ? null
              : `Preventivo «${STATO_LABEL[p.stato] ?? p.stato}»: le righe non si modificano più.`
          }
        />
      </div>

      {p.stato === "APPROVATO" && (
        <section className="card mb-6 p-5" aria-labelledby="t-generati">
          <h2 id="t-generati" className="text-lg font-semibold text-text-1">
            Dal preventivo approvato
          </h2>
          <p className="mt-1 text-sm text-text-3">
            Il cliente ha accettato: l&apos;ordine di lavoro e la fattura
            nascono con i dati e le righe di questo preventivo.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {p.ordiniLavoro.length ? (
              p.ordiniLavoro.map((o) => (
                <Link
                  key={o.id}
                  href={`/ordini/${o.id}`}
                  className="btn-secondary inline-flex items-center gap-2"
                >
                  <span className="font-mono">{o.numero}</span>
                  <Badge valore={o.stato} />
                </Link>
              ))
            ) : (
              <button
                type="button"
                className="btn-primary"
                disabled={inCorso}
                onClick={() => void genera("ordine")}
              >
                Crea ordine di lavoro
              </button>
            )}
            {p.fatture && (
              <>
                {p.fatture.map((f) => (
                  <Link
                    key={f.id}
                    href={`/fatture/${f.id}`}
                    className="btn-secondary inline-flex items-center gap-2"
                  >
                    <span className="font-mono">{f.numero}</span>
                    <Badge valore={f.stato} />
                  </Link>
                ))}
                <button
                  type="button"
                  className={p.fatture.length ? "btn-secondary" : "btn-primary"}
                  disabled={inCorso}
                  onClick={() => void genera("fattura")}
                >
                  {p.fatture.length ? "Nuova fattura" : "Crea fattura"}
                </button>
              </>
            )}
          </div>
        </section>
      )}

      <div className="card ml-auto max-w-xs p-5">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-text-2">Imponibile</dt>
            <dd className="font-mono">{euro(p.totaleNetto)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-2">IVA</dt>
            <dd className="font-mono">{euro(p.totaleIva)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt>Totale</dt>
            <dd className="font-mono">{euro(p.totaleLordo)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
