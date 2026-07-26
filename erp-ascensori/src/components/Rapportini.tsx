"use client";

// Отчетите за намесата по един ордин: списък, създаване и подписване на място.
//
// Живее вътре в детайла на ордина, защото това е контекстът, в който техникът
// работи — да отвори друга страница на телефон, застанал пред машинното
// помещение, не е реалистично.

import { useCallback, useEffect, useState } from "react";
import { CONTROLLI_ART15 } from "@/lib/normativa/verifiche";
import {
  TIPI_INTERVENTO,
  TIPO_INTERVENTO_LABEL,
} from "@/lib/normativa/interventi";
import { Modale, Vuoto } from "@/components/ui";
import {
  IcoNuovoPiccolo,
  IcoStampa,
  IcoIntegro,
  IcoAttenzione,
} from "@/components/icone";
import Firma from "@/components/Firma";
import { apiFetch } from "@/lib/fetch-client";
import { dataOraIt } from "@/lib/format";

interface Rapportino {
  id: string;
  numero: string;
  dataOra: string;
  oreLavoro: string;
  descrizione: string;
  esito: string;
  materiali: string | null;
  firmatoAt: string | null;
  firmatarioNome: string | null;
  tecnico: { nome: string; cognome: string } | null;
}

const ESITI = [
  { value: "RISOLTO", label: "Risolto" },
  { value: "DA_COMPLETARE", label: "Da completare" },
  { value: "RINVIATO", label: "Rinviato" },
  { value: "NON_RISOLVIBILE", label: "Non risolvibile" },
];

/** Отметките са ТРИСТОЙНОСТНИ: празно значи „не е гледано“, не „наред“. */
type Controllo = "" | "si" | "no";

const vuoto = {
  descrizione: "",
  oreLavoro: "1",
  esito: "RISOLTO",
  tipoIntervento: "MANUTENZIONE_ORDINARIA",
  materiali: "",
  controlli: Object.fromEntries(
    CONTROLLI_ART15.map((c) => [c.campo, "" as Controllo]),
  ) as Record<string, Controllo>,
};

export default function Rapportini({ ordineId }: { ordineId: string }) {
  const [righe, setRighe] = useState<Rapportino[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [modale, setModale] = useState<"crea" | null>(null);
  const [daFirmare, setDaFirmare] = useState<Rapportino | null>(null);
  const [form, setForm] = useState(vuoto);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const carica = useCallback(async () => {
    setCaricamento(true);
    try {
      const { ok, dati } = await apiFetch<{ righe: Rapportino[] }>(
        `/api/ordini/${ordineId}/rapportini`,
      );
      if (ok) setRighe(dati.righe ?? []);
    } finally {
      setCaricamento(false);
    }
  }, [ordineId]);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function crea(e: React.FormEvent) {
    e.preventDefault();
    if (inCorso) return;
    setInCorso(true);
    setErrore(null);
    try {
      const { ok, dati } = await apiFetch<{ error?: string }>(
        `/api/ordini/${ordineId}/rapportini`,
        {
          method: "POST",
          body: JSON.stringify({
            descrizione: form.descrizione,
            oreLavoro: form.oreLavoro,
            esito: form.esito,
            tipoIntervento: form.tipoIntervento,
            materiali: form.materiali || null,
            // Празното НЕ се праща като `false`: сървърът пази разликата между
            // „не е проверено“ и „проверено, не е наред“.
            ...Object.fromEntries(
              Object.entries(form.controlli)
                .filter(([, v]) => v !== "")
                .map(([k, v]) => [k, v === "si"]),
            ),
          }),
        },
      );
      if (!ok) {
        setErrore(dati.error ?? "Errore di salvataggio");
        return;
      }
      setForm(vuoto);
      setModale(null);
      void carica();
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-1">
          Rapportini di intervento
        </h2>
        <button
          className="btn-secondary inline-flex h-8 items-center gap-1 px-3 text-xs"
          onClick={() => setModale("crea")}
        >
          <IcoNuovoPiccolo />
          Nuovo rapportino
        </button>
      </div>

      {caricamento ? (
        <p className="text-sm text-text-3">…</p>
      ) : righe.length === 0 ? (
        <Vuoto
          messaggio="Nessun rapportino: compilarne uno al termine dell'intervento."
          azione="Nuovo rapportino"
          onAzione={() => setModale("crea")}
        />
      ) : (
        <ul className="space-y-3">
          {righe.map((r) => (
            <li key={r.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="font-mono text-sm font-medium">
                    {r.numero}
                  </span>
                  <span className="ml-2 text-xs text-text-3">
                    {dataOraIt(r.dataOra)} · {r.oreLavoro} h ·{" "}
                    {ESITI.find((e) => e.value === r.esito)?.label ?? r.esito}
                    {r.tecnico
                      ? ` · ${r.tecnico.nome} ${r.tecnico.cognome}`
                      : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {r.firmatoAt ? (
                    <span className="inline-flex items-center gap-1 text-xs text-success-text">
                      <IcoIntegro />
                      Firmato da {r.firmatarioNome}
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 text-xs text-danger-text">
                        <IcoAttenzione />
                        Non firmato
                      </span>
                      <button
                        className="btn-primary h-7 px-2 text-xs"
                        onClick={() => setDaFirmare(r)}
                      >
                        Far firmare
                      </button>
                    </>
                  )}
                  <a
                    className="btn-ghost inline-flex h-7 items-center gap-1 px-2 text-xs"
                    href={`/api/rapportini/${r.id}/pdf`}
                    target="_blank"
                    rel="noopener"
                  >
                    <IcoStampa />
                    Stampa
                  </a>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-text-2">
                {r.descrizione}
              </p>
              {r.materiali && (
                <p className="mt-1 whitespace-pre-wrap text-xs text-text-3">
                  Materiali: {r.materiali}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modale
        titolo="Nuovo rapportino"
        aperto={modale === "crea"}
        onChiudi={() => setModale(null)}
        largo
      >
        <form onSubmit={crea}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="r-descrizione">
                Descrizione dell&apos;intervento{" "}
                <span className="text-danger-text">*</span>
              </label>
              <textarea
                id="r-descrizione"
                className="input min-h-24 py-2"
                required
                value={form.descrizione}
                onChange={(e) =>
                  setForm({ ...form, descrizione: e.target.value })
                }
              />
            </div>
            <div>
              <label className="label" htmlFor="r-ore">
                Ore di lavoro
              </label>
              <input
                id="r-ore"
                className="input font-mono"
                inputMode="decimal"
                value={form.oreLavoro}
                onChange={(e) =>
                  setForm({ ...form, oreLavoro: e.target.value })
                }
              />
            </div>
            <div>
              <label className="label" htmlFor="r-tipo">
                Tipo di intervento
              </label>
              <select
                id="r-tipo"
                className="input"
                value={form.tipoIntervento}
                onChange={(e) =>
                  setForm({ ...form, tipoIntervento: e.target.value })
                }
              >
                {TIPI_INTERVENTO.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_INTERVENTO_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="r-esito">
                Esito
              </label>
              <select
                id="r-esito"
                className="input"
                value={form.esito}
                onChange={(e) => setForm({ ...form, esito: e.target.value })}
              >
                {ESITI.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="sm:col-span-2">
              <legend className="label mb-1">
                Controlli art. 15 c.4 D.P.R. 162/1999
              </legend>
              <p className="mb-2 text-xs text-text-3">
                Lasciare in bianco ciò che non è stato controllato: «non
                verificato» e «non conforme» sono cose diverse. Un controllo
                critico non conforme mette l&apos;impianto fuori servizio.
              </p>
              <div className="space-y-1">
                {CONTROLLI_ART15.map((c) => (
                  <div
                    key={c.campo}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1 odd:bg-surface-2"
                  >
                    <span className="text-sm">
                      {c.etichetta}
                      {c.critico && (
                        <span className="ml-1 text-xs text-text-3">
                          (critico)
                        </span>
                      )}
                    </span>
                    <div
                      role="radiogroup"
                      aria-label={c.etichetta}
                      className="flex items-center gap-1"
                    >
                      {(
                        [
                          ["si", "Conforme"],
                          ["no", "Non conforme"],
                          ["", "Non verificato"],
                        ] as const
                      ).map(([v, etichetta]) => (
                        <label
                          key={v || "vuoto"}
                          className={`cursor-pointer rounded-sm px-2 py-0.5 text-xs ${
                            form.controlli[c.campo] === v
                              ? v === "si"
                                ? "bg-success-subtle text-success-text"
                                : v === "no"
                                  ? "bg-danger-subtle text-danger-text"
                                  : "bg-surface-3 text-text-2"
                              : "text-text-3"
                          }`}
                        >
                          <input
                            type="radio"
                            className="sr-only"
                            name={`c-${c.campo}`}
                            checked={form.controlli[c.campo] === v}
                            onChange={() =>
                              setForm({
                                ...form,
                                controlli: { ...form.controlli, [c.campo]: v },
                              })
                            }
                          />
                          {etichetta}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="r-materiali">
                Materiali impiegati (uno per riga)
              </label>
              <textarea
                id="r-materiali"
                className="input min-h-20 py-2"
                value={form.materiali}
                onChange={(e) =>
                  setForm({ ...form, materiali: e.target.value })
                }
              />
              <p className="mt-1 text-xs text-text-3">
                La giacenza si muove solo con i movimenti di magazzino: qui si
                annota cosa è stato impiegato sul posto.
              </p>
            </div>
          </div>
          {errore && (
            <p
              role="alert"
              className="mt-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text"
            >
              {errore}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setModale(null)}
            >
              Annulla
            </button>
            <button type="submit" className="btn-primary" disabled={inCorso}>
              {inCorso ? "Salvataggio…" : "Salva"}
            </button>
          </div>
        </form>
      </Modale>

      {daFirmare && (
        <FirmaModale
          rapportino={daFirmare}
          onChiudi={() => setDaFirmare(null)}
          onFirmato={() => {
            setDaFirmare(null);
            void carica();
          }}
        />
      )}
    </div>
  );
}

function FirmaModale({
  rapportino,
  onChiudi,
  onFirmato,
}: {
  rapportino: Rapportino;
  onChiudi: () => void;
  onFirmato: () => void;
}) {
  const [firma, setFirma] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [ruolo, setRuolo] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    if (inCorso) return;
    if (!firma) {
      setErrore("Firma assente: firmare nello spazio indicato");
      return;
    }
    setInCorso(true);
    setErrore(null);
    try {
      const { ok, dati } = await apiFetch<{ error?: string }>(
        `/api/rapportini/${rapportino.id}/firma`,
        {
          method: "POST",
          body: JSON.stringify({
            firmaCliente: firma,
            firmatarioNome: nome,
            firmatarioRuolo: ruolo || null,
          }),
        },
      );
      if (!ok) {
        setErrore(dati.error ?? "Errore");
        return;
      }
      onFirmato();
    } finally {
      setInCorso(false);
    }
  }

  return (
    <Modale
      titolo={`Firma del rapportino ${rapportino.numero}`}
      aperto
      onChiudi={onChiudi}
      largo
    >
      <form onSubmit={invia}>
        <p className="mb-4 rounded-md bg-surface-2 px-3 py-2 text-sm text-text-2">
          {rapportino.descrizione}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="f-nome">
              Nome e cognome di chi firma{" "}
              <span className="text-danger-text">*</span>
            </label>
            <input
              id="f-nome"
              className="input"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="f-ruolo">
              Qualifica
            </label>
            <input
              id="f-ruolo"
              className="input"
              placeholder="Amministratore, portiere, tecnico…"
              value={ruolo}
              onChange={(e) => setRuolo(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4">
          <span className="label">Firma</span>
          <Firma onCambia={setFirma} />
        </div>
        {errore && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text"
          >
            {errore}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onChiudi}>
            Annulla
          </button>
          <button type="submit" className="btn-primary" disabled={inCorso}>
            {inCorso ? "Invio…" : "Conferma la firma"}
          </button>
        </div>
      </form>
    </Modale>
  );
}
