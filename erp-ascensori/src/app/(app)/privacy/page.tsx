"use client";

// Упражняване на правата по чл. 15–17 GDPR върху конкретно лице.
//
// Отделна страница, а не бутон в списъка с потребители: искането идва от ЛИЦЕ,
// което може да е потребител, служител ИЛИ клиент, и служителят, който отговаря
// в срока по чл. 12(3) (един месец), не бива да обхожда три модула, за да
// разбере къде е записано.

import { useState } from "react";
import { apiFetch } from "@/lib/fetch-client";
import { IcoAttenzione, IcoEsporta, IcoIntegro } from "@/components/icone";

interface Soggetto {
  tipo: string;
  id: string;
  etichetta: string;
  anonimizzato: boolean;
}

interface Piano {
  tipo: string;
  campi: { campo: string; valore: string | null }[];
  conservati: { cosa: string; base: string }[];
  revocaSessioni: boolean;
}

const ETICHETTA: Record<string, string> = {
  utente: "Utente del sistema",
  dipendente: "Dipendente",
  amministratore: "Amministratore / cliente",
};

export default function Pagina() {
  const [q, setQ] = useState("");
  const [righe, setRighe] = useState<Soggetto[] | null>(null);
  const [scelto, setScelto] = useState<Soggetto | null>(null);
  const [piano, setPiano] = useState<Piano | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState<{
    tipo: "ok" | "errore";
    testo: string;
  } | null>(null);

  async function cerca(e: React.FormEvent) {
    e.preventDefault();
    setEsito(null);
    setScelto(null);
    setPiano(null);
    const { ok, dati } = await apiFetch<{ righe: Soggetto[] }>(
      `/api/gdpr?q=${encodeURIComponent(q)}`,
    );
    setRighe(ok ? dati.righe : []);
  }

  async function apriPiano(s: Soggetto) {
    setScelto(s);
    setEsito(null);
    const { ok, dati } = await apiFetch<{ piano: Piano }>(
      `/api/gdpr/${s.tipo}/${s.id}/anonimizza`,
    );
    setPiano(ok ? dati.piano : null);
  }

  async function conferma() {
    if (!scelto || inCorso) return;
    setInCorso(true);
    setEsito(null);
    try {
      const { ok, dati } = await apiFetch<{
        error?: string;
        sessioniRevocate?: number;
      }>(`/api/gdpr/${scelto.tipo}/${scelto.id}/anonimizza`, {
        method: "POST",
        body: JSON.stringify({ conferma: true }),
      });
      setEsito(
        ok
          ? {
              tipo: "ok",
              testo: `Soggetto anonimizzato.${
                dati.sessioniRevocate
                  ? ` Sessioni chiuse: ${dati.sessioniRevocate}.`
                  : ""
              }`,
            }
          : {
              tipo: "errore",
              testo: dati.error ?? "Errore durante l'anonimizzazione",
            },
      );
      if (ok) {
        setScelto(null);
        setPiano(null);
        setRighe(null);
      }
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-text-1">
          Diritti dell&apos;interessato
        </h1>
        <p className="mt-1 text-sm text-text-3">
          Accesso e portabilità (artt. 15 e 20) · cancellazione (art. 17). La
          risposta è dovuta entro un mese dalla richiesta (art. 12, par. 3).
        </p>
      </div>

      <form
        onSubmit={cerca}
        className="card mb-6 flex flex-wrap items-end gap-2 p-5"
      >
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="q">
            Nome, cognome, ragione sociale o e-mail
          </label>
          <input
            id="q"
            className="input"
            value={q}
            minLength={2}
            required
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button className="btn-primary" type="submit">
          Cerca
        </button>
      </form>

      {esito && (
        <div
          className={`mb-6 flex items-start gap-2 rounded-md px-4 py-3 text-sm ${
            esito.tipo === "ok"
              ? "bg-success-subtle text-success-text"
              : "bg-danger-subtle text-danger-text"
          }`}
          role="status"
        >
          {esito.tipo === "ok" ? <IcoIntegro /> : <IcoAttenzione />}
          <span>{esito.testo}</span>
        </div>
      )}

      {righe && righe.length === 0 && (
        <p className="text-sm text-text-3">Nessun soggetto trovato.</p>
      )}

      {righe && righe.length > 0 && (
        <div className="card mb-6 p-5">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-text-3">
              <tr>
                <th className="pb-2">Soggetto</th>
                <th className="pb-2">Categoria</th>
                <th className="pb-2 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr
                  key={`${r.tipo}-${r.id}`}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="py-2">
                    {r.etichetta}
                    {r.anonimizzato && (
                      <span className="ml-2 text-xs text-text-3">
                        (già anonimizzato)
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-text-2">
                    {ETICHETTA[r.tipo] ?? r.tipo}
                  </td>
                  <td className="py-2 text-right">
                    <a
                      className="btn-secondary mr-2 inline-flex h-7 items-center gap-1.5 px-2 text-xs"
                      href={`/api/gdpr/${r.tipo}/${r.id}/esporta`}
                    >
                      <IcoEsporta />
                      Esporta
                    </a>
                    <button
                      className="btn-ghost h-7 px-2 text-xs text-danger-text disabled:opacity-40"
                      disabled={r.anonimizzato}
                      onClick={() => void apriPiano(r)}
                    >
                      Anonimizza
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {scelto && piano && (
        <div className="card border-danger/30 p-5">
          <h2 className="text-lg font-semibold text-text-1">
            Anonimizzazione di „{scelto.etichetta}“
          </h2>
          <p className="mt-1 text-sm text-danger-text">
            Operazione irreversibile. Non è una cancellazione: i dati che la
            legge impone di conservare restano, senza la persona.
          </p>

          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium text-text-1">
                Viene rimosso
              </h3>
              <ul className="space-y-1 text-sm text-text-2">
                {piano.campi.map((c) => (
                  <li key={c.campo} className="font-mono text-xs">
                    {c.campo}
                    <span className="ml-2 font-sans text-text-3">
                      → {c.valore === null ? "vuoto" : c.valore}
                    </span>
                  </li>
                ))}
                {piano.revocaSessioni && (
                  <li className="text-xs text-text-3">
                    + tutte le sessioni attive
                  </li>
                )}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium text-text-1">
                Resta, per obbligo di legge
              </h3>
              <ul className="space-y-2 text-sm text-text-2">
                {piano.conservati.map((c) => (
                  <li key={c.cosa}>
                    {c.cosa}
                    <span className="block text-xs text-text-3">{c.base}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <button
              className="btn-danger"
              disabled={inCorso}
              onClick={() => void conferma()}
            >
              {inCorso ? "In corso…" : "Confermo: anonimizza"}
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setScelto(null);
                setPiano(null);
              }}
            >
              Annulla
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
