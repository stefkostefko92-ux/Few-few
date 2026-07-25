"use client";

// Детайл на фактура: редове + статус + тотали. XML тоталът трябва да съвпада.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge, ScheletroDettaglio } from "@/components/ui";
import { IcoIndietro, IcoStampa, IcoEsporta, IcoAttenzione, IcoIntegro } from "@/components/icone";
import VociEditor, { type VoceRiga } from "@/components/VociEditor";
import { euro, dataIt } from "@/lib/format";

interface Fattura {
  id: string;
  numero: string;
  tipo: string;
  stato: string;
  data: string;
  dataScadenza: string | null;
  oggetto: string | null;
  totaleNetto: string;
  totaleIva: string;
  totaleLordo: string;
  amministratore: {
    nome: string;
    cognome: string | null;
    ragioneSociale: string | null;
    partitaIva: string | null;
    pec: string | null;
    indirizzo: string | null;
    citta: string | null;
  } | null;
  ordineLavoro: { numero: string; oggetto: string } | null;
  voci: VoceRiga[];
}

const STATI = ["BOZZA", "EMESSA", "INVIATA", "PAGATA", "SCADUTA", "STORNATA"];

export default function Pagina() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [f, setF] = useState<Fattura | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  // Проверката за SDI е ЖИВА, не изведена от две-три полета в интерфейса: тя е
  // същата, която пази и самият експорт, за да не се разминат двете истини.
  const [sdi, setSdi] = useState<{ pronta: boolean; problemi: string[] } | null>(null);

  const carica = useCallback(async () => {
    const res = await fetch(`/api/fatture/${id}`);
    if (!res.ok) {
      setErrore("Fattura non trovata");
      return;
    }
    const dati: Fattura = await res.json();
    setF(dati);
    if (dati.tipo !== "EMESSA") {
      setSdi(null);
      return;
    }
    const c = await fetch(`/api/fatture/${id}/xml?controlla=1`);
    setSdi(c.ok ? await c.json() : null);
  }, [id]);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function cambiaStato(stato: string) {
    const res = await fetch(`/api/fatture/${id}/stato`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato }),
    });
    const d = await res.json();
    if (!res.ok) {
      alert(d.error ?? "Errore");
      return;
    }
    void carica();
  }

  if (errore) return <p className="text-text-3">{errore}</p>;
  if (!f) return <ScheletroDettaglio />;

  const controparte = f.amministratore
    ? (f.amministratore.ragioneSociale ??
      `${f.amministratore.nome} ${f.amministratore.cognome ?? ""}`)
    : "—";

  return (
    <div>
      <button className="btn-ghost mb-4 h-8 px-2 text-xs" onClick={() => router.push("/fatture")}>
        <IcoIndietro />
        Fatture
      </button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-text-1">
            {f.numero}
          </h1>
          <p className="mt-1 text-sm text-text-2">{f.oggetto ?? "—"}</p>
          <p className="mt-1 text-xs text-text-3">
            {f.tipo} · {controparte} · del {dataIt(f.data)}
            {f.dataScadenza ? ` · scade ${dataIt(f.dataScadenza)}` : ""}
            {f.ordineLavoro ? ` · ordine ${f.ordineLavoro.numero}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            className="btn-secondary inline-flex items-center gap-1.5"
            href={`/api/fatture/${id}/pdf`}
            target="_blank"
            rel="noopener"
          >
            <IcoStampa />
            Stampa
          </a>
          {f.tipo === "EMESSA" && (
            <a
              className={`btn-secondary inline-flex items-center gap-1.5 ${
                sdi && !sdi.pronta ? "pointer-events-none opacity-50" : ""
              }`}
              href={`/api/fatture/${id}/xml`}
              aria-disabled={sdi ? !sdi.pronta : undefined}
              title={
                sdi && !sdi.pronta
                  ? "Completare i requisiti elencati sotto"
                  : "Scarica il file XML da trasmettere allo SDI"
              }
            >
              <IcoEsporta />
              XML SdI
            </a>
          )}
          <Badge valore={f.stato} />
          <select
            className="input w-40"
            value={f.stato}
            onChange={(e) => void cambiaStato(e.target.value)}
            aria-label="Cambia stato"
          >
            {STATI.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {f.tipo === "EMESSA" && sdi && (
        <div
          className={`mb-6 flex items-start gap-2 rounded-md px-4 py-3 text-sm ${
            sdi.pronta
              ? "bg-success-subtle text-success-text"
              : "bg-warning-subtle text-warning-text"
          }`}
          role="status"
        >
          {sdi.pronta ? <IcoIntegro /> : <IcoAttenzione />}
          <div>
            {sdi.pronta ? (
              "Pronta per lo SDI: i requisiti della fattura elettronica sono completi."
            ) : (
              <>
                <p className="font-medium">
                  Non esportabile allo SDI. Finché non è trasmessa, la fattura si considera
                  non emessa (art. 6 D.Lgs. 471/1997).
                </p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                  {sdi.problemi.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      <div className="card mb-6 p-5">
        <h2 className="mb-4 text-lg font-semibold text-text-1">Voci</h2>
        <VociEditor
          api={`/api/fatture/${id}/voci`}
          voci={f.voci}
          conPrezzi
          onCambiato={() => void carica()}
        />
      </div>

      <div className="card ml-auto max-w-xs p-5">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-text-2">Imponibile</dt>
            <dd className="font-mono">{euro(f.totaleNetto)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-2">IVA</dt>
            <dd className="font-mono">{euro(f.totaleIva)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt>Totale documento</dt>
            <dd className="font-mono">{euro(f.totaleLordo)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
