"use client";

// Рентабилност по договор или по импиант.
//
// Подредбата е от НАЙ-ГУБЕЩОТО надолу: човек отваря този екран, защото
// подозира, че някъде излиза на загуба — не за да види, че всичко е наред.

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/fetch-client";
import { ScheletroTabella } from "@/components/ui";
import { IcoAttenzione } from "@/components/icone";
import { euro } from "@/lib/format";

interface Redditivita {
  ricavi: string;
  costoManodopera: string;
  costoMateriali: string;
  costiEsterni: string;
  costoTotale: string;
  margine: string;
  marginePerc: string | null;
  oreSenzaCosto: string;
  materialiSenzaCosto: number;
  completo: boolean;
}

interface Riga {
  id: string;
  etichetta: string;
  redditivita: Redditivita;
}

export default function Pagina() {
  const [per, setPer] = useState<"contratto" | "impianto">("contratto");
  const [da, setDa] = useState("");
  const [a, setA] = useState("");
  const [dati, setDati] = useState<{ righe: Riga[]; nota: string } | null>(null);
  const [caricamento, setCaricamento] = useState(true);

  const carica = useCallback(async () => {
    setCaricamento(true);
    const q = new URLSearchParams({ per });
    if (da) q.set("da", da);
    if (a) q.set("a", a);
    const { ok, dati: d } = await apiFetch<{ righe: Riga[]; nota: string }>(
      `/api/report/redditivita?${q}`,
    );
    setDati(ok ? d : { righe: [], nota: "" });
    setCaricamento(false);
  }, [per, da, a]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const incompleti = dati?.righe.filter((r) => !r.redditivita.completo).length ?? 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-text-1">Redditività</h1>
        <p className="mt-1 text-sm text-text-3">
          Ricavi fatturati contro costi diretti: manodopera, materiali, terzisti.
        </p>
      </div>

      <div className="card mb-6 flex flex-wrap items-end gap-3 p-5">
        <div>
          <label className="label" htmlFor="per">
            Raggruppa per
          </label>
          <select
            id="per"
            className="input w-44"
            value={per}
            onChange={(e) => setPer(e.target.value as "contratto" | "impianto")}
          >
            <option value="contratto">Contratto</option>
            <option value="impianto">Impianto</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="da">
            Dal
          </label>
          <input id="da" type="date" className="input w-40" value={da} onChange={(e) => setDa(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="a">
            Al
          </label>
          <input id="a" type="date" className="input w-40" value={a} onChange={(e) => setA(e.target.value)} />
        </div>
      </div>

      {incompleti > 0 && (
        <div
          className="mb-5 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2.5 text-sm text-warning-text"
          role="status"
        >
          <IcoAttenzione />
          <span>
            {incompleti === 1
              ? "Una riga ha costi incompleti"
              : `${incompleti} righe hanno costi incompleti`}
            : ore senza costo orario del dipendente o materiali senza prezzo di acquisto. Il
            costo mancante <strong>non</strong> è considerato zero, ma il margine mostrato è
            più alto di quello reale.
          </span>
        </div>
      )}

      {caricamento ? (
        <ScheletroTabella righe={6} />
      ) : !dati?.righe.length ? (
        <p className="text-sm text-text-3">
          Nessun dato nel periodo. Servono ordini collegati a un contratto o a un impianto.
        </p>
      ) : (
        <div className="card overflow-x-auto p-5">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-text-3">
              <tr>
                <th className="pb-2">{per === "contratto" ? "Contratto" : "Impianto"}</th>
                <th className="pb-2 text-right">Ricavi</th>
                <th className="pb-2 text-right">Manodopera</th>
                <th className="pb-2 text-right">Materiali</th>
                <th className="pb-2 text-right">Terzisti</th>
                <th className="pb-2 text-right">Margine</th>
                <th className="pb-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {dati.righe.map((r) => {
                const negativo = r.redditivita.margine.startsWith("-");
                return (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3">
                      {r.etichetta}
                      {!r.redditivita.completo && (
                        <span className="ml-2 text-xs text-warning-text">costi incompleti</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">{euro(r.redditivita.ricavi)}</td>
                    <td className="py-2 pr-3 text-right font-mono text-text-2">
                      {euro(r.redditivita.costoManodopera)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-text-2">
                      {euro(r.redditivita.costoMateriali)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-text-2">
                      {euro(r.redditivita.costiEsterni)}
                    </td>
                    <td
                      className={`py-2 pr-3 text-right font-mono font-medium ${
                        negativo ? "text-danger-text" : "text-text-1"
                      }`}
                    >
                      {euro(r.redditivita.margine)}
                    </td>
                    <td
                      className={`py-2 text-right font-mono ${
                        negativo ? "text-danger-text" : "text-text-2"
                      }`}
                    >
                      {/* Знакът НЕ носи смисъла сам: числото е отрицателно и се чете. */}
                      {r.redditivita.marginePerc === null ? "—" : `${r.redditivita.marginePerc} %`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dati?.nota && <p className="mt-4 max-w-3xl text-xs text-text-3">{dati.nota}</p>}
    </div>
  );
}
