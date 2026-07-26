"use client";

// Кой колко дължи и от колко време.
//
// Екранът отговаря на въпрос, на който списъкът с фактури не отговаря: не „кои
// са неплатени", а „накъде да гледам първо". Затова горе стоят възрастовите
// кофи, после длъжниците по РИСК (най-старото просрочие, не най-голямата сума),
// и чак после отделните документи.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/fetch-client";
import { dataIt } from "@/lib/format";
import { Vuoto } from "@/components/ui";
import { IcoAttenzione } from "@/components/icone";

interface Fascia {
  chiave: string;
  etichetta: string;
  totale: string;
  documenti: number;
}

interface Debitore {
  debitoreId: string;
  debitore: string;
  totale: string;
  documenti: number;
  ritardoMassimo: number;
}

interface Riga {
  fatturaId: string;
  numero: string;
  data: string;
  dataScadenza: string | null;
  residuo: string;
  debitore: string;
  giorniRitardo: number;
  fascia: string;
  sollecitiInviati: number;
  prossimoSollecito: number | null;
}

interface Dati {
  righe: Riga[];
  fasce: Fascia[];
  debitori: Debitore[];
  totale: string;
}

/** Цветът не носи смисъла сам: до него винаги стои и числото в дни. */
function stileRitardo(giorni: number): string {
  if (giorni < 0) return "text-text-3";
  if (giorni <= 30) return "text-text-2";
  if (giorni <= 90) return "text-warning-text";
  return "text-danger-text";
}

export default function Pagina() {
  const [d, setD] = useState<Dati | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const carica = useCallback(async () => {
    const { ok, dati } = await apiFetch<Dati & { error?: string }>(
      "/api/report/scadenzario",
    );
    if (ok) setD(dati);
    else setErrore(dati.error ?? "Errore");
  }, []);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function sollecita(r: Riga) {
    if (inCorso || r.prossimoSollecito === null) return;
    setInCorso(true);
    setErrore(null);
    try {
      const { ok, dati } = await apiFetch<{ error?: string }>(
        `/api/fatture/${r.fatturaId}/solleciti`,
        {
          method: "POST",
          body: JSON.stringify({
            livello: r.prossimoSollecito,
            canale: "email",
          }),
        },
      );
      if (!ok) setErrore(dati.error ?? "Errore");
      else await carica();
    } finally {
      setInCorso(false);
    }
  }

  if (errore && !d)
    return (
      <p className="text-sm text-danger-text" role="alert">
        {errore}
      </p>
    );
  if (!d) return <p className="text-sm text-text-3">…</p>;

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-1">Scadenzario</h1>
        <p className="mt-1 text-sm text-text-3">
          Crediti aperti per anzianità. Gli importi sono al netto della ritenuta
          d&apos;acconto e dello split payment: è quanto l&apos;azienda incassa
          davvero.
        </p>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {d.fasce.map((f) => (
          <div key={f.chiave} className="card p-4">
            <div className="text-xs text-text-3">{f.etichetta}</div>
            <div className="mt-1 font-mono text-lg font-semibold text-text-1">
              {f.totale} €
            </div>
            <div className="text-xs text-text-3">
              {f.documenti} {f.documenti === 1 ? "documento" : "documenti"}
            </div>
          </div>
        ))}
      </div>

      {d.righe.length === 0 ? (
        <Vuoto messaggio="Nessun credito aperto: tutte le fatture emesse risultano incassate." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="card p-5" aria-label="Debitori">
            <h2 className="mb-3 text-lg font-semibold text-text-1">
              Per debitore
            </h2>
            <p className="mb-2 text-xs text-text-3">
              Ordinati per anzianità del credito più vecchio, non per importo.
            </p>
            <ul className="space-y-2">
              {d.debitori.map((x) => (
                <li
                  key={x.debitoreId}
                  className="flex items-start justify-between gap-2 border-b border-border pb-2 text-sm last:border-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-text-1">
                      {x.debitore}
                    </span>
                    <span className={`text-xs ${stileRitardo(x.ritardoMassimo)}`}>
                      {x.ritardoMassimo} giorni · {x.documenti}{" "}
                      {x.documenti === 1 ? "documento" : "documenti"}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-text-1">
                    {x.totale} €
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card overflow-x-auto p-5 lg:col-span-2" aria-label="Documenti">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-1">Documenti</h2>
              <span className="font-mono text-sm text-text-1">
                {d.totale} €
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-3">
                  <th scope="col" className="pb-2">Numero</th>
                  <th scope="col" className="pb-2">Debitore</th>
                  <th scope="col" className="pb-2">Scadenza</th>
                  <th scope="col" className="pb-2 text-right">Ritardo</th>
                  <th scope="col" className="pb-2 text-right">Residuo</th>
                  <th scope="col" className="pb-2 text-right">Sollecito</th>
                </tr>
              </thead>
              <tbody>
                {d.righe.map((r) => (
                  <tr key={r.fatturaId} className="border-b border-border last:border-0">
                    <td className="py-2">
                      <Link
                        className="font-mono text-xs text-accent-text hover:underline"
                        href={`/fatture/${r.fatturaId}`}
                      >
                        {r.numero}
                      </Link>
                    </td>
                    <td className="max-w-40 truncate py-2 text-text-2">
                      {r.debitore}
                    </td>
                    <td className="py-2 text-xs text-text-3">
                      {r.dataScadenza ? dataIt(r.dataScadenza) : "—"}
                    </td>
                    <td className={`py-2 text-right text-xs ${stileRitardo(r.giorniRitardo)}`}>
                      {r.giorniRitardo > 90 && (
                        <IcoAttenzione />
                      )}{" "}
                      {r.giorniRitardo} gg
                    </td>
                    <td className="py-2 text-right font-mono">{r.residuo} €</td>
                    <td className="py-2 text-right">
                      {r.prossimoSollecito === null ? (
                        <span className="text-xs text-text-3">
                          {r.sollecitiInviati > 0
                            ? `${r.sollecitiInviati} inviati`
                            : "—"}
                        </span>
                      ) : (
                        <button
                          className="btn-secondary h-7 px-2 text-xs"
                          disabled={inCorso}
                          onClick={() => void sollecita(r)}
                        >
                          Registra {r.prossimoSollecito}º
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {errore && (
        <p className="mt-3 text-sm text-danger-text" role="alert">
          {errore}
        </p>
      )}
    </div>
  );
}
