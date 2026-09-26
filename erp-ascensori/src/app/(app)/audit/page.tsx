"use client";

// Registro operazioni — само четене + проверка на HMAC целостта.

import { useCallback, useEffect, useState } from "react";
import { Paginazione, Vuoto } from "@/components/ui";
import { IcoAlterato, IcoIntegro } from "@/components/icone";
import { dataOraIt, plurale } from "@/lib/format";
import { AZIONE_AUDIT } from "@/lib/enum-labels";
import { apiFetch } from "@/lib/fetch-client";

interface EsitoVerifica {
  controllate: number;
  integro: boolean;
  corrotte: unknown[];
  catenaRotta: unknown[];
  codaTroncata: unknown[];
  ancoraAlterata: unknown[];
  ancoraAssente: unknown[];
  conChiaveVecchia: unknown[];
  error?: string;
}

/**
 * Всяка находка на проверката поотделно. Преди текстът броеше само редовете с
 * невалиден подпис — при изтрит ред или отрязана опашка пишеше „0 righe con
 * firma non valida" и операторът го приемаше за фалшива тревога.
 */
function descriviAlterazione(d: EsitoVerifica): string {
  const parti = [
    d.corrotte.length &&
      plurale(d.corrotte.length, "firma non valida", "firme non valide"),
    d.catenaRotta.length &&
      `${plurale(d.catenaRotta.length, "anello interrotto", "anelli interrotti")} (righe eliminate)`,
    d.codaTroncata.length &&
      `coda del registro eliminata in ${plurale(d.codaTroncata.length, "azienda", "aziende")}`,
    d.ancoraAlterata.length &&
      plurale(d.ancoraAlterata.length, "ancora alterata", "ancore alterate"),
  ].filter(Boolean);
  return `ALTERAZIONE RILEVATA: ${parti.join(" · ")}`;
}

interface RigaAudit {
  id: string;
  azione: string;
  entita: string;
  entitaId: string | null;
  ip: string | null;
  createdAt: string;
  utente: { nome: string; cognome: string; email: string } | null;
}

const AZIONI = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGOUT",
  "STATE_CHANGE",
  "IMPORT",
];

const STILE_AZIONE: Record<string, string> = {
  CREATE: "bg-success-subtle text-success-text",
  UPDATE: "bg-accent-subtle text-accent-text",
  DELETE: "bg-danger-subtle text-danger-text",
  LOGIN: "bg-surface-3 text-text-2",
  LOGOUT: "bg-surface-3 text-text-2",
  STATE_CHANGE: "bg-warning-subtle text-warning-text",
  IMPORT: "bg-accent-subtle text-accent-text",
};

export default function Pagina() {
  const [righe, setRighe] = useState<RigaAudit[]>([]);
  const [totale, setTotale] = useState(0);
  const [page, setPage] = useState(1);
  const [azione, setAzione] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  /** Резултатът е СТРУКТУРА, не сглобен низ: така иконата, цветът и текстът
   *  се избират отделно, вместо да се кодира състояние в самия текст. */
  const [verifica, setVerifica] = useState<{
    esito: "in-corso" | "integro" | "alterato" | "errore";
    testo: string;
  } | null>(null);
  const size = 50;

  const carica = useCallback(async () => {
    const r = await apiFetch<{
      righe: RigaAudit[];
      totale: number;
      error?: string;
    }>(
      `/api/audit?page=${page}&size=${size}${azione ? `&azione=${azione}` : ""}`,
    );
    if (!r.ok) {
      setErrore(r.dati.error ?? "Errore");
      return;
    }
    setRighe(r.dati.righe);
    setTotale(r.dati.totale);
  }, [page, azione]);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function verificaIntegrita() {
    if (verifica?.esito === "in-corso") return;
    setVerifica({ esito: "in-corso", testo: "Verifica in corso…" });
    const r = await apiFetch<EsitoVerifica>("/api/audit/verifica", {
      method: "POST",
      body: JSON.stringify({ limite: 1000 }),
    });
    const d = r.dati;
    if (!r.ok) setVerifica({ esito: "errore", testo: d.error ?? "Errore" });
    else if (d.integro)
      setVerifica({
        esito: "integro",
        testo:
          `Integro: ${plurale(d.controllate, "riga verificata", "righe verificate")}, nessuna alterazione` +
          (d.ancoraAssente.length
            ? ` (punto di ancoraggio non ancora creato per ${plurale(d.ancoraAssente.length, "azienda", "aziende")})`
            : ""),
      });
    else setVerifica({ esito: "alterato", testo: descriviAlterazione(d) });
  }

  if (errore) return <Vuoto messaggio={errore} />;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-1">
            Registro operazioni
          </h1>
          <p className="mt-1 text-sm text-text-3">
            Traccia immutabile firmata HMAC-SHA256 · in sola lettura: nessun
            livello può modificarla
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Бутонът е ПРЕДИ празната зона за статус: иначе на телефон тя
              отместваше бутона с празнина. */}
          <button
            className="btn-secondary"
            disabled={verifica?.esito === "in-corso"}
            onClick={() => void verificaIntegrita()}
          >
            Verifica integrità
          </button>
          {/* Резултатът от проверката на целостта е критичен и идва асинхронно —
              без `aria-live` потребител на екранен четец не научава за него. */}
          <span
            className="flex items-center gap-1.5 text-xs"
            role="status"
            aria-live="polite"
          >
            {verifica?.esito === "integro" && <IcoIntegro />}
            {verifica?.esito === "alterato" && <IcoAlterato />}
            {verifica && (
              <span
                className={
                  verifica.esito === "integro"
                    ? "text-success-text"
                    : verifica.esito === "alterato"
                      ? "font-medium text-danger-text"
                      : "text-text-2"
                }
              >
                {verifica.testo}
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-border p-3">
          <select
            className="input max-w-48"
            value={azione}
            onChange={(e) => {
              setAzione(e.target.value);
              setPage(1);
            }}
            aria-label="Filtra per azione"
          >
            <option value="">Tutte le azioni</option>
            {AZIONI.map((a) => (
              <option key={a} value={a}>
                {AZIONE_AUDIT[a] ?? a}
              </option>
            ))}
          </select>
        </div>
        {righe.length === 0 ? (
          <Vuoto messaggio="Nessuna operazione registrata" />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-xs font-medium uppercase tracking-wide text-text-3">
                  <th className="px-3 py-2.5">Data e ora</th>
                  <th className="px-3 py-2.5">Azione</th>
                  <th className="px-3 py-2.5">Entità</th>
                  <th className="px-3 py-2.5">Record</th>
                  <th className="px-3 py-2.5">Utente</th>
                  <th className="px-3 py-2.5">IP</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-3 py-2.5 font-mono text-xs text-text-2">
                      {dataOraIt(r.createdAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-sm px-2 py-0.5 text-xs font-medium ${STILE_AZIONE[r.azione] ?? "bg-surface-3"}`}
                      >
                        {AZIONE_AUDIT[r.azione] ?? r.azione}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">{r.entita}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-text-3">
                      {r.entitaId ? r.entitaId.slice(0, 8) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.utente ? `${r.utente.nome} ${r.utente.cognome}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-text-3">
                      {r.ip ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Paginazione
          page={page}
          size={size}
          totale={totale}
          onPagina={setPage}
        />
      </div>
    </div>
  );
}
