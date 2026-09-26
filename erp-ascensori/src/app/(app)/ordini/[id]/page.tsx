"use client";

// Детайл на ордина: позволени преходи като бутони + пълна хронология (storico).

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge, ScheletroDettaglio } from "@/components/ui";
import { IcoIndietro, IcoTransizione, IcoVerso } from "@/components/icone";
import { STATO_LABEL, etichetta } from "@/lib/enum-labels";
import Rapportini from "@/components/Rapportini";
import TempiIntervento from "@/components/TempiIntervento";
import { dataIt, dataOraIt } from "@/lib/format";
import { TRANSIZIONI, type Stato } from "@/lib/workflow";
import { apiFetch } from "@/lib/fetch-client";

interface Ordine {
  id: string;
  numero: string;
  stato: Stato;
  priorita: string;
  oggetto: string;
  descrizione: string | null;
  noteInterne: string | null;
  noteCommittente: string | null;
  dataInizio: string | null;
  dataFine: string | null;
  impianto: { matricola: string; indirizzo: string | null } | null;
  tecnico: { nome: string; cognome: string } | null;
  cottimista: { ragioneSociale: string } | null;
  squadra: { nome: string } | null;
  preventivo: { numero: string } | null;
  storico: {
    id: string;
    statoPrecedente: string | null;
    statoNuovo: string;
    nota: string | null;
    utente: string;
    createdAt: string;
  }[];
  fatture: { id: string; numero: string; stato: string }[];
  ddt: { id: string; numero: string; data: string }[];
}

export default function Pagina() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [o, setO] = useState<Ordine | null>(null);
  const [nota, setNota] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [erroreAzione, setErroreAzione] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const carica = useCallback(async () => {
    const r = await apiFetch<Ordine & { error?: string }>(`/api/ordini/${id}`);
    if (!r.ok) {
      setErrore(r.dati.error ?? "Ordine non trovato");
      return;
    }
    setO(r.dati);
  }, [id]);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function transizione(stato: Stato) {
    if (inCorso) return;
    // Крайните състояния не се връщат: едно погрешно натискане е завинаги.
    if (
      (stato === "ANNULLATO" || stato === "CHIUSO") &&
      !confirm(
        `Portare l'ordine a «${etichetta(STATO_LABEL, stato)}»? Lo stato è definitivo.`,
      )
    )
      return;
    setInCorso(true);
    setErroreAzione(null);
    const r = await apiFetch<{ error?: string }>(`/api/ordini/${id}/stato`, {
      method: "PATCH",
      body: JSON.stringify({ stato, nota: nota || null }),
    });
    setInCorso(false);
    if (!r.ok) {
      setErroreAzione(r.dati.error ?? "Errore");
      return;
    }
    setNota("");
    void carica();
  }

  if (errore) return <p className="text-text-3">{errore}</p>;
  if (!o) return <ScheletroDettaglio />;

  const ammesse = TRANSIZIONI[o.stato] ?? [];

  return (
    <div>
      <button
        className="btn-ghost mb-4 h-8 px-2 text-xs"
        onClick={() => router.push("/ordini")}
      >
        <IcoIndietro />
        Ordini di lavoro
      </button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-text-1">
            {o.numero}
          </h1>
          <p className="mt-1 text-sm text-text-2">{o.oggetto}</p>
          <p className="mt-1 text-xs text-text-3">
            Impianto {o.impianto?.matricola ?? "—"}
            {o.impianto?.indirizzo ? ` · ${o.impianto.indirizzo}` : ""}
            {o.preventivo ? ` · da preventivo ${o.preventivo.numero}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge valore={o.priorita} />
          <Badge valore={o.stato} />
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-5">
            <h2 className="mb-3 text-lg font-semibold text-text-1">
              Flusso di lavoro
            </h2>
            {ammesse.length === 0 ? (
              <p className="text-sm text-text-3">
                Stato finale: nessuna transizione possibile.
              </p>
            ) : (
              <>
                <input
                  className="input mb-3"
                  placeholder="Motivazione del passaggio (facoltativa)"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  {ammesse.map((s) => (
                    <button
                      key={s}
                      className={`inline-flex items-center gap-1.5 ${s === "ANNULLATO" ? "btn-danger" : "btn-primary"}`}
                      disabled={inCorso}
                      onClick={() => void transizione(s)}
                    >
                      <IcoTransizione />
                      {etichetta(STATO_LABEL, s)}
                    </button>
                  ))}
                </div>
                {erroreAzione && (
                  <p
                    role="alert"
                    className="mt-3 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text"
                  >
                    {erroreAzione}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-lg font-semibold text-text-1">Dettagli</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-text-3">Tecnico</dt>
                <dd>
                  {o.tecnico ? `${o.tecnico.cognome} ${o.tecnico.nome}` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-text-3">Ditta esterna / squadra</dt>
                <dd>
                  {o.cottimista?.ragioneSociale ?? "—"}
                  {o.squadra ? ` · ${o.squadra.nome}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-text-3">Inizio effettivo</dt>
                <dd>{dataIt(o.dataInizio)}</dd>
              </div>
              <div>
                <dt className="text-text-3">Fine effettiva</dt>
                <dd>{dataIt(o.dataFine)}</dd>
              </div>
              {o.descrizione && (
                <div className="sm:col-span-2">
                  <dt className="text-text-3">Descrizione</dt>
                  <dd className="whitespace-pre-wrap">{o.descrizione}</dd>
                </div>
              )}
              {o.noteInterne && (
                <div className="sm:col-span-2">
                  <dt className="text-text-3">Note interne (non stampate)</dt>
                  <dd className="whitespace-pre-wrap">{o.noteInterne}</dd>
                </div>
              )}
              {o.noteCommittente && (
                <div className="sm:col-span-2">
                  <dt className="text-text-3">Note del committente</dt>
                  <dd className="whitespace-pre-wrap">{o.noteCommittente}</dd>
                </div>
              )}
            </dl>
          </div>

          {(o.fatture.length > 0 || o.ddt.length > 0) && (
            <div className="card p-5">
              <h2 className="mb-3 text-lg font-semibold text-text-1">
                Documenti collegati
              </h2>
              <ul className="space-y-1 text-sm">
                {o.fatture.map((f) => (
                  <li key={f.id} className="flex items-center gap-2">
                    <span className="font-mono">{f.numero}</span>{" "}
                    <Badge valore={f.stato} />
                  </li>
                ))}
                {o.ddt.map((d) => (
                  <li key={d.id} className="font-mono">
                    {d.numero} · {dataIt(d.data)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <TempiIntervento ordineId={id} />

          <Rapportini ordineId={id} />
        </div>

        <div className="card h-fit p-5">
          <h2 className="mb-3 text-lg font-semibold text-text-1">
            Storico stati
          </h2>
          <ol className="space-y-3">
            {o.storico.map((s) => (
              <li key={s.id} className="border-l-2 border-border pl-3 text-sm">
                <div className="flex items-center gap-1.5">
                  {s.statoPrecedente && (
                    <>
                      <Badge valore={s.statoPrecedente} />
                      <span className="text-text-3">
                        <IcoVerso />
                      </span>
                    </>
                  )}
                  <Badge valore={s.statoNuovo} />
                </div>
                <div className="mt-1 text-xs text-text-3">
                  {dataOraIt(s.createdAt)} · {s.utente}
                </div>
                {s.nota && (
                  <div className="mt-0.5 text-xs text-text-2">{s.nota}</div>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
