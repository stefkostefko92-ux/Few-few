"use client";

// Упражняване на правата по чл. 15–17 GDPR върху конкретно лице.
//
// Отделна страница, а не бутон в списъка с потребители: искането идва от ЛИЦЕ,
// което може да е потребител, служител ИЛИ клиент, и служителят, който отговаря
// в срока по чл. 12(3) (един месец), не бива да обхожда три модула, за да
// разбере къде е записано.

import { useEffect, useState } from "react";
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

      {/* Разкриването на AI функцията стои ТУК, при правата на субекта, а не в
          настройките: чл. 13, ал. 1, б. „д“ иска получателите на личните данни
          да са известни на лицето, а получател е и доставчикът на модела. */}
      <TrattamentoAi />

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

/**
 * Какво излиза навън, когато функцията е включена.
 *
 * Чете ЖИВОТО състояние вместо да описва намерение: разкритие, което твърди
 * едно, а конфигурацията прави друго, е по-лошо от липсващо. Когато функцията е
 * изключена, това също се казва — операторът има право да знае, че документите
 * му НЕ излизат никъде.
 */
function TrattamentoAi() {
  const [stato, setStato] = useState<{
    attiva: boolean;
    fornitore: string;
  } | null>(null);

  useEffect(() => {
    let vivo = true;
    void fetch("/api/ai/estrai")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => vivo && setStato(d))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  if (!stato) return null;
  return (
    <div className="card mb-6 p-5">
      <h2 className="text-lg font-semibold text-text-1">
        Funzioni assistite da un modello linguistico
      </h2>
      {stato.attiva ? (
        <>
          <p className="mt-1 text-sm text-text-2">
            La funzione «Compila da un documento» è <strong>attiva</strong>. Il
            documento caricato viene trasmesso a{" "}
            <strong>{stato.fornitore}</strong>, che lo elabora per conto del
            titolare e ne restituisce i dati estratti. Il documento può
            contenere dati personali (nomi, codici fiscali, indirizzi).
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-2">
            <li>
              Il trasferimento avviene solo quando un operatore carica un
              documento: non c&apos;è alcun invio automatico.
            </li>
            <li>
              Nel registro delle operazioni resta traccia dell&apos;invio (chi,
              quando, quale scheda, impronta del file) ma <strong>non</strong>{" "}
              il contenuto del documento.
            </li>
            <li>
              I dati estratti sono una proposta: nulla viene salvato senza
              conferma di una persona.
            </li>
            <li>
              Il fornitore agisce come responsabile del trattamento (art. 28
              GDPR): l&apos;accordo con lui e l&apos;informativa ai clienti sono
              a carico del titolare.
            </li>
          </ul>
          {/* Втората функция е РАЗЛИЧНО обработване и се обявява отделно:
              там навън излиза документ, тук — бележка, писана от оператора.
              Слети в едно изречение, човекът научава за едното и пропуска
              другото (чл. 12(1) ОРЗД иска ясно и разделно). */}
          <p className="mt-3 text-sm text-text-2">
            È attiva anche la funzione «Scrivi con l&apos;AI», che riformula gli
            appunti del tecnico in una descrizione o in un riepilogo. In questo
            caso a {stato.fornitore} viene inviato{" "}
            <strong>il testo scritto dall&apos;operatore</strong>, non un
            documento. Valgono le stesse regole: nessun invio automatico, nel
            registro resta solo il fatto (chi, quando, quale compito, quanti
            caratteri) e non il testo, il risultato è una proposta modificabile
            che nessuno salva al posto di una persona.
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-text-2">
          Le funzioni sono <strong>disattivate</strong>: nessun documento e
          nessun testo lascia questo server.
        </p>
      )}
    </div>
  );
}
