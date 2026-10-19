"use client";

// „Area cliente": администраторът на кондоминиуми вижда своите импианти,
// сроковете им, отворените интервенции и издадените фактури (с PDF).
// Само четене — всичко, което се променя, минава през фирмата.

import { useEffect, useState } from "react";
import { Badge, ScheletroDettaglio, Vuoto } from "@/components/ui";
import { IcoStampa } from "@/components/icone";
import { apiFetch } from "@/lib/fetch-client";
import { dataIt, euro } from "@/lib/format";
import { TIPO_SCADENZA, etichetta } from "@/lib/enum-labels";

interface Riepilogo {
  collegato: boolean;
  error?: string;
  amministratore?: {
    nome: string;
    cognome: string | null;
    ragioneSociale: string | null;
  };
  condomini?: { id: string; nome: string; indirizzo: string; citta: string }[];
  impianti?: {
    id: string;
    matricola: string;
    indirizzo: string | null;
    stato: string;
    ultimaRevisione: string | null;
    prossimaRevisione: string | null;
    condominio: { nome: string } | null;
  }[];
  scadenze?: {
    id: string;
    tipo: string;
    dataScadenza: string;
    impianto: { matricola: string };
  }[];
  ordini?: {
    id: string;
    numero: string;
    oggetto: string;
    stato: string;
    priorita: string;
    createdAt: string;
    impianto: { matricola: string } | null;
  }[];
  fatture?: {
    id: string;
    numero: string;
    data: string;
    dataScadenza: string | null;
    totaleLordo: string;
    stato: string;
    statoPagamento: string;
    condominio: { nome: string } | null;
  }[];
}

const TH =
  "px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-3";
const TD = "px-3 py-2.5";

function Indicatore({ titolo, valore }: { titolo: string; valore: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
      <div className="text-xs text-text-3">{titolo}</div>
      <div className="mt-1 font-mono text-2xl text-text-1">{valore}</div>
    </div>
  );
}

export default function AreaCliente() {
  const [d, setD] = useState<Riepilogo | null>(null);

  useEffect(() => {
    void apiFetch<Riepilogo>("/api/cliente/riepilogo").then((r) =>
      setD(
        r.ok
          ? r.dati
          : {
              collegato: false,
              error: r.dati.error ?? "Errore di caricamento",
            },
      ),
    );
  }, []);

  if (!d) return <ScheletroDettaglio carte={3} />;
  if (d.error)
    return (
      <p role="alert" className="text-sm text-danger-text">
        {d.error}
      </p>
    );
  if (!d.collegato)
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-text-1">
          Area cliente
        </h1>
        <p className="mt-4 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-text-2">
          L&apos;account non è ancora collegato a un amministratore: chiedere
          all&apos;azienda di manutenzione di completare l&apos;attivazione.
          Fino ad allora non è visibile nessun dato.
        </p>
      </div>
    );

  const a = d.amministratore!;
  const nome = a.ragioneSociale ?? `${a.nome} ${a.cognome ?? ""}`.trim();
  const oggi = Date.now();
  const entro30 = (d.scadenze ?? []).filter(
    (s) => new Date(s.dataScadenza).getTime() - oggi < 30 * 86_400_000,
  ).length;
  const daPagare = (d.fatture ?? []).filter(
    (f) => f.statoPagamento !== "PAGATA" && f.stato !== "STORNATA",
  ).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-text-1">
          Area cliente
        </h1>
        <p className="mt-1 text-sm text-text-3">
          {nome} · impianti, scadenze di legge, interventi e fatture
        </p>
      </div>

      <section
        aria-label="Indicatori"
        className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <Indicatore titolo="Impianti" valore={d.impianti?.length ?? 0} />
        <Indicatore titolo="Scadenze entro 30 gg" valore={entro30} />
        <Indicatore
          titolo="Interventi in corso"
          valore={d.ordini?.length ?? 0}
        />
        <Indicatore titolo="Fatture da pagare" valore={daPagare} />
      </section>

      <section className="card mb-6" aria-labelledby="t-impianti">
        <h2
          id="t-impianti"
          className="border-b border-border p-4 text-lg font-semibold text-text-1"
        >
          Impianti
        </h2>
        {d.impianti?.length ? (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className={TH}>Matricola</th>
                  <th className={TH}>Condominio</th>
                  <th className={TH}>Indirizzo</th>
                  <th className={TH}>Stato</th>
                  <th className={TH}>Ultima verifica</th>
                  <th className={TH}>Prossima verifica</th>
                </tr>
              </thead>
              <tbody>
                {d.impianti.map((i) => (
                  <tr
                    key={i.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className={`${TD} whitespace-nowrap font-mono`}>
                      {i.matricola}
                    </td>
                    <td className={TD}>{i.condominio?.nome ?? "—"}</td>
                    <td className={TD}>{i.indirizzo ?? "—"}</td>
                    <td className={TD}>
                      <Badge valore={i.stato} />
                    </td>
                    <td className={TD}>{dataIt(i.ultimaRevisione)}</td>
                    <td className={TD}>{dataIt(i.prossimaRevisione)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Vuoto messaggio="Nessun impianto collegato" />
        )}
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="card" aria-labelledby="t-scadenze">
          <h2
            id="t-scadenze"
            className="border-b border-border p-4 text-lg font-semibold text-text-1"
          >
            Scadenze di legge
          </h2>
          {d.scadenze?.length ? (
            <ul className="divide-y divide-border text-sm">
              {d.scadenze.map((s) => (
                <li
                  key={s.id}
                  className="flex justify-between gap-3 px-4 py-2.5"
                >
                  <span>
                    <span className="font-mono">{s.impianto.matricola}</span> ·{" "}
                    {etichetta(TIPO_SCADENZA, s.tipo)}
                  </span>
                  <span className="font-mono text-text-2">
                    {dataIt(s.dataScadenza)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Vuoto messaggio="Nessuna scadenza aperta" />
          )}
        </section>

        <section className="card" aria-labelledby="t-ordini">
          <h2
            id="t-ordini"
            className="border-b border-border p-4 text-lg font-semibold text-text-1"
          >
            Interventi in corso
          </h2>
          {d.ordini?.length ? (
            <ul className="divide-y divide-border text-sm">
              {d.ordini.map((o) => (
                <li key={o.id} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono">{o.numero}</span>
                    <span className="flex gap-1.5">
                      <Badge valore={o.priorita} />
                      <Badge valore={o.stato} />
                    </span>
                  </div>
                  <div className="mt-0.5 text-text-2">
                    {o.oggetto}
                    {o.impianto ? ` · ${o.impianto.matricola}` : ""} · aperto il{" "}
                    {dataIt(o.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Vuoto messaggio="Nessun intervento in corso" />
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="t-fatture">
        <h2
          id="t-fatture"
          className="border-b border-border p-4 text-lg font-semibold text-text-1"
        >
          Fatture
        </h2>
        {d.fatture?.length ? (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className={TH}>Numero</th>
                  <th className={TH}>Data</th>
                  <th className={TH}>Condominio</th>
                  <th className={TH}>Scadenza</th>
                  <th className={`${TH} text-right`}>Totale</th>
                  <th className={TH}>Pagamento</th>
                  <th className={TH}>
                    <span className="sr-only">Documento</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.fatture.map((f) => (
                  <tr
                    key={f.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className={`${TD} whitespace-nowrap font-mono`}>
                      {f.numero}
                    </td>
                    <td className={TD}>{dataIt(f.data)}</td>
                    <td className={TD}>{f.condominio?.nome ?? "—"}</td>
                    <td className={TD}>{dataIt(f.dataScadenza)}</td>
                    <td className={`${TD} text-right font-mono`}>
                      {euro(f.totaleLordo)}
                    </td>
                    <td className={TD}>
                      <Badge
                        valore={
                          f.stato === "STORNATA" ? f.stato : f.statoPagamento
                        }
                      />
                    </td>
                    <td className={`${TD} text-right`}>
                      <a
                        className="btn-ghost inline-flex h-7 items-center gap-1 px-2 text-xs"
                        href={`/api/cliente/fatture/${f.id}/pdf`}
                        target="_blank"
                        rel="noopener"
                        aria-label={`PDF della fattura ${f.numero}`}
                      >
                        <IcoStampa /> PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Vuoto messaggio="Nessuna fattura emessa" />
        )}
      </section>
    </div>
  );
}
