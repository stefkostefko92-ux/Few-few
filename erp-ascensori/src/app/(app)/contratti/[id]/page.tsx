"use client";

// Детайл на договора: покрити импианти, график на посещенията и на
// фактурирането, родените документи и позволените преходи на състоянието.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, ScheletroDettaglio } from "@/components/ui";
import { IcoIndietro, IcoTransizione, IcoVerso } from "@/components/icone";
import { euro, dataIt } from "@/lib/format";
import { apiFetch } from "@/lib/fetch-client";
import { PERIODICITA_LABEL, type Periodicita } from "@/lib/contratti-logic";
import {
  TRANSIZIONI_CONTRATTO,
  type StatoContratto,
} from "@/lib/regole-contratti";
import { STATO_LABEL, etichetta } from "@/lib/enum-labels";

interface Contratto {
  id: string;
  numero: string;
  stato: StatoContratto;
  oggetto: string;
  canone: string;
  aliquotaIva: string;
  periodicitaVisite: Periodicita;
  periodicitaFatturazione: Periodicita;
  dataInizio: string;
  dataFine: string;
  rinnovoAutomatico: boolean;
  preavvisoMesi: number;
  prossimaVisita: string | null;
  prossimaFattura: string | null;
  note: string | null;
  amministratore: {
    ragioneSociale: string | null;
    nome: string;
    cognome: string | null;
  } | null;
  condominio: { nome: string; citta: string } | null;
  impianti: {
    id: string;
    impianto: {
      id: string;
      matricola: string;
      marca: string;
      indirizzo: string | null;
    };
  }[];
  ordini: {
    id: string;
    numero: string;
    stato: string;
    dataInizio: string | null;
    oggetto: string;
  }[];
  fatture: {
    id: string;
    numero: string;
    stato: string;
    data: string;
    totaleLordo: string;
  }[];
}

export default function Pagina() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [c, setC] = useState<Contratto | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useCallback(async () => {
    const { ok, dati } = await apiFetch<Contratto & { error?: string }>(
      `/api/contratti/${id}`,
    );
    if (ok) setC(dati);
    else setErrore(dati.error ?? "Errore di caricamento");
  }, [id]);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function transizione(stato: StatoContratto) {
    const { ok, dati } = await apiFetch<{ error?: string }>(
      `/api/contratti/${id}/stato`,
      {
        method: "PATCH",
        body: JSON.stringify({ stato }),
      },
    );
    if (!ok) {
      alert(dati.error ?? "Errore");
      return;
    }
    void carica();
  }

  if (errore) return <p className="text-danger-text">{errore}</p>;
  if (!c) return <ScheletroDettaglio />;

  const ammesse = TRANSIZIONI_CONTRATTO[c.stato] ?? [];
  const cliente = c.amministratore
    ? (c.amministratore.ragioneSociale ??
      `${c.amministratore.nome} ${c.amministratore.cognome ?? ""}`)
    : "—";

  return (
    <div>
      <button
        className="mb-3 inline-flex items-center gap-1 text-sm text-text-3 hover:text-text-1"
        onClick={() => router.push("/contratti")}
      >
        <IcoIndietro />
        Contratti
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-text-1">
            {c.numero}
          </h1>
          <p className="mt-1 text-sm text-text-2">{c.oggetto}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-text-3">
            {cliente}
            {c.condominio
              ? ` · ${c.condominio.nome}, ${c.condominio.citta}`
              : ""}{" "}
            · {dataIt(c.dataInizio)}
            <IcoVerso />
            {dataIt(c.dataFine)}
          </p>
        </div>
        <Badge valore={c.stato} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-5">
            <h2 className="mb-3 text-lg font-semibold text-text-1">
              Ciclo di vita
            </h2>
            {ammesse.length === 0 ? (
              <p className="text-sm text-text-3">
                Stato finale: non sono previsti altri passaggi.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {ammesse.map((s) => (
                  <button
                    key={s}
                    className={`inline-flex items-center gap-1.5 ${s === "DISDETTO" ? "btn-danger" : "btn-primary"}`}
                    onClick={() => void transizione(s)}
                  >
                    <IcoTransizione />
                    {etichetta(STATO_LABEL, s)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-lg font-semibold text-text-1">
              Impianti coperti ({c.impianti.length})
            </h2>
            {c.impianti.length === 0 ? (
              <p className="text-sm text-text-3">
                Nessun impianto associato: il contratto non genererà visite.
              </p>
            ) : (
              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                {c.impianti.map((ci) => (
                  <li key={ci.id}>
                    <Link
                      href={`/impianti/${ci.impianto.id}`}
                      className="font-mono font-medium text-accent-text hover:underline"
                    >
                      {ci.impianto.matricola}
                    </Link>
                    <span className="text-text-3">
                      {" "}
                      · {ci.impianto.marca}
                      {ci.impianto.indirizzo
                        ? ` · ${ci.impianto.indirizzo}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-lg font-semibold text-text-1">
              Documenti generati
            </h2>
            {c.ordini.length === 0 && c.fatture.length === 0 ? (
              <p className="text-sm text-text-3">
                Nessun documento ancora: le visite e le fatture vengono generate
                automaticamente alle date indicate.
              </p>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-3">
                    Ordini di lavoro
                  </h3>
                  <ul className="space-y-1 text-sm">
                    {c.ordini.map((o) => (
                      <li
                        key={o.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <Link
                          href={`/ordini/${o.id}`}
                          className="font-mono text-accent-text hover:underline"
                        >
                          {o.numero}
                        </Link>
                        <span className="text-xs text-text-3">
                          {dataIt(o.dataInizio)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-3">
                    Fatture
                  </h3>
                  <ul className="space-y-1 text-sm">
                    {c.fatture.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <Link
                          href={`/fatture/${f.id}`}
                          className="font-mono text-accent-text hover:underline"
                        >
                          {f.numero}
                        </Link>
                        <span className="font-mono text-xs">
                          {euro(f.totaleLordo)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-lg font-semibold text-text-1">
            Condizioni economiche
          </h2>
          <dl className="space-y-2 text-sm">
            <Riga label="Canone per periodo" valore={euro(c.canone)} />
            <Riga label="Aliquota IVA" valore={`${c.aliquotaIva} %`} />
            <Riga
              label="Fatturazione"
              valore={PERIODICITA_LABEL[c.periodicitaFatturazione] ?? "—"}
            />
            <Riga
              label="Visite"
              valore={PERIODICITA_LABEL[c.periodicitaVisite] ?? "—"}
            />
            <Riga
              label="Rinnovo tacito"
              valore={
                c.rinnovoAutomatico
                  ? `Sì, preavviso ${c.preavvisoMesi} mesi`
                  : "No"
              }
            />
          </dl>

          <h3 className="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-text-3">
            Prossime generazioni
          </h3>
          <dl className="space-y-2 text-sm">
            <Riga label="Visita" valore={dataIt(c.prossimaVisita)} />
            <Riga label="Fattura" valore={dataIt(c.prossimaFattura)} />
          </dl>
          {c.stato !== "ATTIVO" && (
            <p className="mt-3 text-xs text-text-3">
              Il contratto genera documenti solo quando è attivo.
            </p>
          )}

          {c.note && (
            <p className="mt-4 whitespace-pre-wrap text-sm text-text-2">
              {c.note}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Riga({
  label,
  valore,
}: {
  label: string;
  valore: string | number | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-text-3">{label}</dt>
      <dd className="text-right font-medium text-text-1">{valore ?? "—"}</dd>
    </div>
  );
}
