"use client";

// Данните на издаващата фирма. Влизат в ГЛАВАТА на всеки печатен документ и
// са задължителни на DDT по чл. 1, ал. 3 D.P.R. 472/1996 — затова страницата
// показва изрично кои от тях още липсват, вместо да остави документите непълни.

import { useCallback, useEffect, useState } from "react";
import { ScheletroDettaglio } from "@/components/ui";
import { IcoAttenzione, IcoIntegro } from "@/components/icone";
import { apiFetch } from "@/lib/fetch-client";

type Dati = Record<string, string | null>;

const CAMPI: {
  name: string;
  label: string;
  aiuto?: string;
  largo?: boolean;
}[] = [
  { name: "ragioneSociale", label: "Ragione sociale", largo: true },
  { name: "partitaIva", label: "Partita IVA" },
  { name: "codiceFiscale", label: "Codice fiscale" },
  { name: "indirizzo", label: "Indirizzo (sede legale)", largo: true },
  { name: "cap", label: "CAP" },
  { name: "citta", label: "Città" },
  { name: "provincia", label: "Provincia (sigla)" },
  { name: "telefono", label: "Telefono" },
  { name: "email", label: "E-mail" },
  { name: "pec", label: "PEC" },
  {
    name: "codiceSdi",
    label: "Codice destinatario (SdI)",
    aiuto: "Per la fatturazione elettronica",
  },
  {
    name: "regimeFiscale",
    label: "Regime fiscale",
    aiuto: "Codice del regime: RF01 ordinario, RF19 forfettario",
  },
  { name: "iban", label: "IBAN", aiuto: "Stampato in calce ai documenti" },
  { name: "rea", label: "Numero REA" },
  { name: "capitaleSociale", label: "Capitale sociale" },
  { name: "notePiePagina", label: "Nota a piè di pagina", largo: true },
];

/** Реквизитите, без които печатният документ не е редовен. */
const OBBLIGATORI = [
  "ragioneSociale",
  "partitaIva",
  "indirizzo",
  "cap",
  "citta",
];

/** Реквизити, които печатният документ търпи, но SDI — не. */
const OBBLIGATORI_SDI = ["provincia", "regimeFiscale"];

export default function Pagina() {
  const [dati, setDati] = useState<Dati | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);
  const [esito, setEsito] = useState<{
    tipo: "ok" | "errore";
    testo: string;
  } | null>(null);

  const carica = useCallback(async () => {
    const { ok, dati: d } = await apiFetch<Dati>("/api/dati-azienda");
    setDati(ok ? d : {});
  }, []);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    if (salvataggio || !dati) return;
    setSalvataggio(true);
    setEsito(null);
    try {
      const corpo: Dati = {};
      for (const c of CAMPI)
        corpo[c.name] = (dati[c.name] ?? "") === "" ? null : dati[c.name];
      const { ok, dati: r } = await apiFetch<{ error?: string }>(
        "/api/dati-azienda",
        {
          method: "PUT",
          body: JSON.stringify(corpo),
        },
      );
      setEsito(
        ok
          ? { tipo: "ok", testo: "Dati salvati." }
          : { tipo: "errore", testo: r.error ?? "Errore di salvataggio" },
      );
      if (ok) void carica();
    } finally {
      setSalvataggio(false);
    }
  }

  if (!dati) return <ScheletroDettaglio carte={1} />;

  const mancanti = OBBLIGATORI.filter((c) => !dati[c]);
  const mancantiSdi = OBBLIGATORI_SDI.filter((c) => !dati[c]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-text-1">
          Dati aziendali
        </h1>
        <p className="mt-1 text-sm text-text-3">
          Compaiono in testa a preventivi, documenti contabili e documenti di
          trasporto
        </p>
      </div>

      <div
        className={`mb-5 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
          mancanti.length
            ? "border-danger/30 bg-danger-subtle text-danger-text"
            : "border-border bg-surface-2 text-text-2"
        }`}
        role="status"
      >
        {mancanti.length ? <IcoAttenzione /> : <IcoIntegro />}
        <span>
          {mancanti.length ? (
            <>
              Dati obbligatori mancanti:{" "}
              <strong>
                {mancanti
                  .map((m) => CAMPI.find((c) => c.name === m)?.label)
                  .join(", ")}
              </strong>
              . Sono richiesti sul documento di trasporto dall&apos;art. 1,
              comma 3, D.P.R. 472/1996.
            </>
          ) : (
            "Tutti i dati obbligatori per la stampa sono compilati."
          )}
        </span>
      </div>

      {mancantiSdi.length > 0 && (
        <div
          className="mb-5 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2.5 text-sm text-warning-text"
          role="status"
        >
          <IcoAttenzione />
          <span>
            La stampa funziona, la fattura elettronica no. Mancano:{" "}
            <strong>
              {mancantiSdi
                .map((m) => CAMPI.find((c) => c.name === m)?.label)
                .join(", ")}
            </strong>
            . Senza questi dati il file XML viene rifiutato dallo SDI e la
            fattura risulta non emessa.
          </span>
        </div>
      )}

      <form onSubmit={salva} className="card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {CAMPI.map((c) => (
            <div key={c.name} className={c.largo ? "sm:col-span-2" : ""}>
              <label className="label" htmlFor={`f-${c.name}`}>
                {c.label}
                {OBBLIGATORI.includes(c.name) && (
                  <span className="ml-1 text-danger-text">*</span>
                )}
                {OBBLIGATORI_SDI.includes(c.name) && (
                  <span
                    className="ml-1 text-warning-text"
                    title="Richiesto per la fattura elettronica"
                  >
                    *
                  </span>
                )}
              </label>
              <input
                id={`f-${c.name}`}
                className="input"
                value={dati[c.name] ?? ""}
                onChange={(e) => setDati({ ...dati, [c.name]: e.target.value })}
              />
              {c.aiuto && <p className="mt-1 text-xs text-text-3">{c.aiuto}</p>}
            </div>
          ))}
        </div>

        {esito && (
          <p
            role="status"
            className={`mt-4 rounded-md px-3 py-2 text-sm ${
              esito.tipo === "ok"
                ? "bg-success-subtle text-success-text"
                : "bg-danger-subtle text-danger-text"
            }`}
          >
            {esito.testo}
          </p>
        )}

        <div className="mt-6 flex justify-end">
          <button type="submit" className="btn-primary" disabled={salvataggio}>
            {salvataggio ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      </form>
    </div>
  );
}
