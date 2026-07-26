"use client";

// Ключове за публичното API и абонаменти за събития.
//
// Двете са на един екран, защото са една задача: „свържи счетоводния софтуер".
// Ключът е за дърпане, webhook-ът — за бутане.

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/fetch-client";
import { IcoAttenzione, IcoIntegro } from "@/components/icone";
import { dataIt } from "@/lib/format";

interface Chiave {
  id: string;
  prefisso: string;
  etichetta: string;
  ambiti: string[];
  ultimoUso: string | null;
  scadenza: string | null;
}
interface Webhook {
  id: string;
  url: string;
  eventi: string[];
  attivo: boolean;
  fallimenti: number;
  _count: { consegne: number };
}

/** Показва се ВЕДНЪЖ. Затова е отделен блок, не ред в таблица. */
function Segreto({ valore, etichetta }: { valore: string; etichetta: string }) {
  return (
    <div className="mt-4 rounded-md border border-warning/40 bg-warning-subtle px-4 py-3">
      <p className="text-sm font-medium text-warning-text">
        {etichetta} — copiare ora, non sarà più visibile
      </p>
      <code className="mt-2 block break-all rounded bg-surface-2 px-2 py-1.5 font-mono text-xs text-text-1">
        {valore}
      </code>
    </div>
  );
}

export default function Pagina() {
  const [chiavi, setChiavi] = useState<Chiave[]>([]);
  const [ambiti, setAmbiti] = useState<string[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [eventi, setEventi] = useState<string[]>([]);
  const [nuovoSegreto, setNuovoSegreto] = useState<{
    testo: string;
    etichetta: string;
  } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const [etichetta, setEtichetta] = useState("");
  const [ambitiScelti, setAmbitiScelti] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [eventiScelti, setEventiScelti] = useState<string[]>([]);

  const carica = useCallback(async () => {
    const [k, w] = await Promise.all([
      apiFetch<{ righe: Chiave[]; ambitiDisponibili: string[] }>("/api/chiavi"),
      apiFetch<{ righe: Webhook[]; eventiDisponibili: string[] }>(
        "/api/webhooks",
      ),
    ]);
    if (k.ok) {
      setChiavi(k.dati.righe);
      setAmbiti(k.dati.ambitiDisponibili);
    }
    if (w.ok) {
      setWebhooks(w.dati.righe);
      setEventi(w.dati.eventiDisponibili);
    }
  }, []);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function creaChiave(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    const { ok, dati } = await apiFetch<{ chiave?: string; error?: string }>(
      "/api/chiavi",
      {
        method: "POST",
        body: JSON.stringify({ etichetta, ambiti: ambitiScelti }),
      },
    );
    if (!ok) return setErrore(dati.error ?? "Errore");
    setNuovoSegreto({ testo: dati.chiave ?? "", etichetta: "Chiave API" });
    setEtichetta("");
    setAmbitiScelti([]);
    void carica();
  }

  async function creaWebhook(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    const { ok, dati } = await apiFetch<{ segreto?: string; error?: string }>(
      "/api/webhooks",
      {
        method: "POST",
        body: JSON.stringify({ url, eventi: eventiScelti }),
      },
    );
    if (!ok) return setErrore(dati.error ?? "Errore");
    setNuovoSegreto({
      testo: dati.segreto ?? "",
      etichetta: "Segreto di firma",
    });
    setUrl("");
    setEventiScelti([]);
    void carica();
  }

  const alterna = (lista: string[], v: string, set: (l: string[]) => void) =>
    set(lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-text-1">
          Integrazioni
        </h1>
        <p className="mt-1 text-sm text-text-3">
          Chiavi per leggere i dati da un altro software · webhook per ricevere
          gli eventi senza interrogare.
        </p>
      </div>

      {errore && (
        <div className="mb-5 flex items-start gap-2 rounded-md bg-danger-subtle px-4 py-3 text-sm text-danger-text">
          <IcoAttenzione />
          <span>{errore}</span>
        </div>
      )}

      {nuovoSegreto && (
        <Segreto
          valore={nuovoSegreto.testo}
          etichetta={nuovoSegreto.etichetta}
        />
      )}

      <section className="card mt-6 p-5">
        <h2 className="mb-4 text-lg font-semibold text-text-1">Chiavi API</h2>

        {chiavi.length === 0 ? (
          <p className="mb-4 text-sm text-text-3">Nessuna chiave attiva.</p>
        ) : (
          <table className="mb-5 w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-text-3">
              <tr>
                <th className="pb-2">Etichetta</th>
                <th className="pb-2">Prefisso</th>
                <th className="pb-2">Ambiti</th>
                <th className="pb-2">Ultimo uso</th>
                <th className="pb-2 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {chiavi.map((k) => (
                <tr
                  key={k.id}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="py-2">{k.etichetta}</td>
                  <td className="py-2 font-mono text-xs text-text-2">
                    {k.prefisso}…
                  </td>
                  <td className="py-2 text-xs text-text-2">
                    {k.ambiti.join(", ")}
                  </td>
                  <td className="py-2 text-text-3">
                    {k.ultimoUso ? dataIt(k.ultimoUso) : "mai usata"}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      className="btn-ghost h-7 px-2 text-xs text-danger-text"
                      onClick={async () => {
                        await apiFetch(`/api/chiavi/${k.id}`, {
                          method: "DELETE",
                        });
                        void carica();
                      }}
                    >
                      Revoca
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form onSubmit={creaChiave} className="border-t border-border pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <label className="label" htmlFor="etichetta">
                Etichetta (a cosa serve)
              </label>
              <input
                id="etichetta"
                className="input"
                required
                value={etichetta}
                onChange={(e) => setEtichetta(e.target.value)}
              />
            </div>
            <button
              className="btn-primary"
              type="submit"
              disabled={!ambitiScelti.length}
            >
              Crea chiave
            </button>
          </div>
          <fieldset className="mt-3">
            <legend className="label">
              Ambiti (nessuno selezionato = nessun accesso)
            </legend>
            <div className="flex flex-wrap gap-3">
              {ambiti.map((a) => (
                <label
                  key={a}
                  className="flex items-center gap-1.5 text-sm text-text-2"
                >
                  <input
                    type="checkbox"
                    checked={ambitiScelti.includes(a)}
                    onChange={() => alterna(ambitiScelti, a, setAmbitiScelti)}
                  />
                  <span className="font-mono text-xs">{a}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </form>
      </section>

      <section className="card mt-6 p-5">
        <h2 className="mb-4 text-lg font-semibold text-text-1">Webhook</h2>

        {webhooks.length === 0 ? (
          <p className="mb-4 text-sm text-text-3">
            Nessun webhook configurato.
          </p>
        ) : (
          <table className="mb-5 w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-text-3">
              <tr>
                <th className="pb-2">Indirizzo</th>
                <th className="pb-2">Eventi</th>
                <th className="pb-2">Stato</th>
                <th className="pb-2 text-right">Consegne</th>
                <th className="pb-2 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((w) => (
                <tr
                  key={w.id}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="max-w-xs truncate py-2 font-mono text-xs">
                    {w.url}
                  </td>
                  <td className="py-2 text-xs text-text-2">
                    {w.eventi.join(", ")}
                  </td>
                  <td className="py-2">
                    {w.attivo ? (
                      <span className="inline-flex items-center gap-1 text-success-text">
                        <IcoIntegro />
                        attivo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-danger-text">
                        <IcoAttenzione />
                        disattivato ({w.fallimenti} fallimenti)
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right font-mono text-text-2">
                    {w._count.consegne}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      className="btn-ghost h-7 px-2 text-xs text-danger-text"
                      onClick={async () => {
                        await apiFetch(`/api/webhooks/${w.id}`, {
                          method: "DELETE",
                        });
                        void carica();
                      }}
                    >
                      Elimina
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form onSubmit={creaWebhook} className="border-t border-border pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <label className="label" htmlFor="url">
                Indirizzo HTTPS del ricevente
              </label>
              <input
                id="url"
                type="url"
                className="input font-mono text-sm"
                required
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <button
              className="btn-primary"
              type="submit"
              disabled={!eventiScelti.length}
            >
              Crea webhook
            </button>
          </div>
          <fieldset className="mt-3">
            <legend className="label">Eventi</legend>
            <div className="flex flex-wrap gap-3">
              {eventi.map((e) => (
                <label
                  key={e}
                  className="flex items-center gap-1.5 text-sm text-text-2"
                >
                  <input
                    type="checkbox"
                    checked={eventiScelti.includes(e)}
                    onChange={() => alterna(eventiScelti, e, setEventiScelti)}
                  />
                  <span className="font-mono text-xs">{e}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </form>

        <p className="mt-4 text-xs text-text-3">
          Ogni consegna è firmata:{" "}
          <code className="font-mono">x-erp-signature</code> è
          l&apos;HMAC-SHA256 di{" "}
          <code className="font-mono">timestamp.corpo</code> con il segreto.
          Verificare sempre firma e{" "}
          <code className="font-mono">x-erp-timestamp</code> (tolleranza 5
          minuti) prima di fidarsi del contenuto.
        </p>
      </section>
    </div>
  );
}
