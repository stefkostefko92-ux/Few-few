"use client";

// „Modello dei documenti" — видът на всеки печатен документ на фирмата.
//
// Шаблонът се НАСТРОЙВА тук, а се ПРИЛАГА на сървъра (`src/lib/pdf/`): лого,
// цвят, шрифт, поле, кои контакти да се печатат, заглавия и текстове по вид
// документ. Прегледът ползва шаблона ОТ ФОРМАТА, още незаписан, върху
// истинските данни на фирмата и измислен получател — нищо не се номерира.
// Какво не се сменя (реквизитите по закон, заглавието на фактурата) е казано на
// екрана, до полето, не в бележка.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ScheletroDettaglio } from "@/components/ui";
import { IcoAttenzione } from "@/components/icone";
import { apiFetch, apiFile } from "@/lib/fetch-client";
import {
  CARATTERI,
  SEGNAPOSTI,
  TIPI_DOCUMENTO,
  TITOLO_FISSO,
  contrastoSuBianco,
  type ModelloDocumenti,
  type TipoDocumento,
} from "@/lib/pdf/modello";

const NOMI: Record<TipoDocumento, string> = {
  preventivo: "Preventivo",
  fattura: "Documento contabile",
  ddt: "DDT",
  rapportino: "Rapportino",
  libretto: "Libretto impianto",
};

interface Stato {
  modello: ModelloDocumenti;
  haLogo: boolean;
  datiPresenti: boolean;
}

export default function PaginaModello() {
  const [m, setM] = useState<ModelloDocumenti | null>(null);
  const [haLogo, setHaLogo] = useState(false);
  const [datiPresenti, setDatiPresenti] = useState(true);
  const [versioneLogo, setVersioneLogo] = useState(0);
  const [tipo, setTipo] = useState<TipoDocumento>("preventivo");
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(
    null,
  );
  const [inCorso, setInCorso] = useState<string | null>(null);

  const carica = useCallback(async () => {
    const r = await apiFetch<Stato & { error?: string }>(
      "/api/dati-azienda/modello",
    );
    if (!r.ok) {
      setErrore(r.dati.error ?? "Impossibile leggere il modello.");
      return;
    }
    setM(r.dati.modello);
    setHaLogo(r.dati.haLogo);
    setDatiPresenti(r.dati.datiPresenti);
  }, []);

  useEffect(() => {
    void carica();
  }, [carica]);

  if (errore)
    return (
      <p role="alert" className="text-sm text-danger-text">
        {errore}
      </p>
    );
  if (!m) return <ScheletroDettaglio carte={3} />;

  const doc = m.documenti[tipo];
  const aggiorna = (p: Partial<ModelloDocumenti>) => setM({ ...m, ...p });
  const aggiornaDoc = (p: Partial<typeof doc>) =>
    setM({
      ...m,
      documenti: { ...m.documenti, [tipo]: { ...doc, ...p } },
    });
  const contrasto = contrastoSuBianco(m.colore);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    if (inCorso) return;
    setInCorso("salva");
    setEsito(null);
    const r = await apiFetch<{ error?: string; modello?: ModelloDocumenti }>(
      "/api/dati-azienda/modello",
      { method: "PUT", body: JSON.stringify(m) },
    );
    setInCorso(null);
    if (r.ok && r.dati.modello) setM(r.dati.modello);
    setEsito(
      r.ok
        ? { ok: true, testo: "Modello salvato: vale per i prossimi documenti." }
        : { ok: false, testo: r.dati.error ?? "Errore di salvataggio." },
    );
  }

  async function anteprima() {
    if (inCorso) return;
    // Прозорецът се отваря ВЕДНАГА, в жеста на човека: отворен след чакането,
    // браузърът го смята за изскачащ и го спира.
    const finestra = window.open("", "_blank");
    setInCorso("anteprima");
    setEsito(null);
    const res = await apiFile("/api/dati-azienda/modello/anteprima", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, modello: m }),
    });
    setInCorso(null);
    if (!res || !res.ok) {
      finestra?.close();
      const d = res ? await res.json().catch(() => ({})) : {};
      setEsito({
        ok: false,
        testo:
          (d as { error?: string }).error ??
          "Anteprima non disponibile: verificare la connessione.",
      });
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    if (finestra) finestra.location.href = url;
    else window.location.href = url;
  }

  async function caricaLogo(file: File) {
    if (inCorso) return;
    setInCorso("logo");
    setEsito(null);
    const form = new FormData();
    form.set("file", file);
    const res = await apiFile("/api/dati-azienda/logo", {
      method: "PUT",
      body: form,
    });
    setInCorso(null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setEsito({
        ok: false,
        testo:
          (d as { error?: string }).error ??
          "Caricamento non riuscito: verificare la connessione.",
      });
      return;
    }
    setHaLogo(true);
    setVersioneLogo((v) => v + 1);
    setEsito({
      ok: true,
      testo:
        "Logo caricato. I metadati dell'immagine (EXIF, posizione) sono stati rimossi.",
    });
  }

  async function rimuoviLogo() {
    if (inCorso || !confirm("Rimuovere il logo dai documenti?")) return;
    setInCorso("logo");
    const r = await apiFetch<{ error?: string }>("/api/dati-azienda/logo", {
      method: "DELETE",
    });
    setInCorso(null);
    if (r.ok) setHaLogo(false);
    else setEsito({ ok: false, testo: r.dati.error ?? "Errore" });
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-1">
            Modello dei documenti
          </h1>
          <p className="mt-1 text-sm text-text-3">
            Aspetto di preventivi, documenti contabili, DDT, rapportini e
            libretti. I dati dell&apos;azienda si modificano in{" "}
            <Link href="/impostazioni" className="text-accent-text underline">
              Dati aziendali
            </Link>
            .
          </p>
        </div>
      </div>

      {!datiPresenti && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2.5 text-sm text-warning-text"
        >
          <IcoAttenzione />
          <span>
            Compilare e salvare prima i{" "}
            <Link href="/impostazioni" className="underline">
              dati aziendali
            </Link>
            : il modello e il logo si salvano insieme a loro.
          </span>
        </div>
      )}

      <form onSubmit={salva} className="space-y-6">
        {/* ── Логото ── */}
        <section className="card p-5" aria-labelledby="t-logo">
          <h2 id="t-logo" className="text-lg font-semibold text-text-1">
            Logo
          </h2>
          <p className="mt-1 text-sm text-text-3">
            PNG o JPEG, al massimo 512 KB. I metadati (EXIF, posizione GPS,
            autore) vengono rimossi al caricamento.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="flex h-20 w-44 items-center justify-center rounded-md border border-border bg-white p-2">
              {haLogo ? (
                // Логото идва от сървъра (проверен PNG/JPEG), никога отвън.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/dati-azienda/logo?v=${versioneLogo}`}
                  alt="Logo attuale dell'azienda"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-xs text-gray-500">Nessun logo</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <label
                className={`btn-secondary cursor-pointer ${!datiPresenti ? "pointer-events-none opacity-50" : ""}`}
              >
                {haLogo ? "Sostituisci logo" : "Carica logo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="sr-only"
                  disabled={!datiPresenti || inCorso !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void caricaLogo(f);
                  }}
                />
              </label>
              {haLogo && (
                <button
                  type="button"
                  className="btn-ghost text-danger-text"
                  onClick={() => void rimuoviLogo()}
                >
                  Rimuovi
                </button>
              )}
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="logo-posizione">
                Posizione
              </label>
              <select
                id="logo-posizione"
                className="input"
                value={m.logo.posizione}
                onChange={(e) =>
                  aggiorna({
                    logo: {
                      ...m.logo,
                      posizione: e.target.value as typeof m.logo.posizione,
                    },
                  })
                }
              >
                <option value="sinistra">
                  Accanto ai dati dell&apos;azienda
                </option>
                <option value="sopra">Sopra i dati dell&apos;azienda</option>
                <option value="nessuna">Non stampare il logo</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="logo-larghezza">
                Larghezza massima: {m.logo.larghezza} pt (
                {Math.round(m.logo.larghezza * 0.3528)} mm)
              </label>
              <input
                id="logo-larghezza"
                type="range"
                min={40}
                max={220}
                step={5}
                className="w-full accent-accent"
                value={m.logo.larghezza}
                onChange={(e) =>
                  aggiorna({
                    logo: { ...m.logo, larghezza: Number(e.target.value) },
                  })
                }
              />
            </div>
          </div>
        </section>

        {/* ── Видът ── */}
        <section className="card p-5" aria-labelledby="t-aspetto">
          <h2 id="t-aspetto" className="text-lg font-semibold text-text-1">
            Aspetto
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="colore">
                Colore dei titoli
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="colore-scelta"
                  type="color"
                  aria-label="Scegli il colore"
                  className="h-9 w-12 cursor-pointer rounded border border-border bg-surface"
                  value={m.colore}
                  onChange={(e) => aggiorna({ colore: e.target.value })}
                />
                <input
                  id="colore"
                  className="input font-mono"
                  value={m.colore}
                  maxLength={7}
                  onChange={(e) => aggiorna({ colore: e.target.value })}
                />
              </div>
              {contrasto < 4.5 && (
                <p className="mt-1 text-xs text-warning-text" role="status">
                  Colore poco leggibile sulla carta bianca (contrasto{" "}
                  {contrasto.toFixed(1).replace(".", ",")}:1, consigliato almeno
                  4,5:1).
                </p>
              )}
            </div>
            <div>
              <label className="label" htmlFor="carattere">
                Carattere
              </label>
              <select
                id="carattere"
                className="input"
                value={m.carattere}
                onChange={(e) =>
                  aggiorna({
                    carattere: e.target.value as ModelloDocumenti["carattere"],
                  })
                }
              >
                {Object.entries(CARATTERI).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.etichetta}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="margine">
                Margini
              </label>
              <select
                id="margine"
                className="input"
                value={m.margine}
                onChange={(e) =>
                  aggiorna({
                    margine: e.target.value as ModelloDocumenti["margine"],
                  })
                }
              >
                <option value="stretto">Stretti (1 cm)</option>
                <option value="normale">Normali (1,4 cm)</option>
                <option value="ampio">Ampi (2 cm)</option>
              </select>
            </div>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-text-1">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent"
              checked={m.numeriPagina}
              onChange={(e) => aggiorna({ numeriPagina: e.target.checked })}
            />
            Numero di pagina in basso («Pagina 1 di 2»)
          </label>
        </section>

        {/* ── Заглавната част ── */}
        <section className="card p-5" aria-labelledby="t-intestazione">
          <h2 id="t-intestazione" className="text-lg font-semibold text-text-1">
            Intestazione
          </h2>
          <p className="mt-1 text-sm text-text-3">
            Ragione sociale, sede, partita IVA e codice fiscale sono sempre
            stampati: sono obbligatori sui documenti (art. 21 D.P.R. 633/1972,
            art. 1 D.P.R. 472/1996). REA e capitale sociale, se compilati,
            compaiono sempre a piè di pagina (art. 2250 c.c.).
          </p>
          <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
            <legend className="label">Contatti da stampare</legend>
            {(
              [
                ["mostraTelefono", "Telefono"],
                ["mostraEmail", "E-mail"],
                ["mostraPec", "PEC"],
                ["mostraSitoWeb", "Sito web"],
              ] as const
            ).map(([k, etichetta]) => (
              <label
                key={k}
                className="flex items-center gap-2 text-sm text-text-1"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-accent"
                  checked={m.intestazione[k]}
                  onChange={(e) =>
                    aggiorna({
                      intestazione: {
                        ...m.intestazione,
                        [k]: e.target.checked,
                      },
                    })
                  }
                />
                {etichetta}
              </label>
            ))}
          </fieldset>
          <label className="label mt-4" htmlFor="righe-extra">
            Righe aggiuntive (una per riga)
          </label>
          <textarea
            id="righe-extra"
            className="input min-h-20"
            maxLength={400}
            placeholder={"Certificazione ISO 9001\nSede operativa: Via …"}
            value={m.intestazione.righeExtra}
            onChange={(e) =>
              aggiorna({
                intestazione: { ...m.intestazione, righeExtra: e.target.value },
              })
            }
          />
        </section>

        {/* ── По вид документ ── */}
        <section className="card p-5" aria-labelledby="t-documenti">
          <h2 id="t-documenti" className="text-lg font-semibold text-text-1">
            Testi per tipo di documento
          </h2>
          <div
            className="mt-4 flex flex-wrap gap-1 border-b border-border"
            role="tablist"
            aria-label="Tipo di documento"
          >
            {TIPI_DOCUMENTO.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`scheda-${t}`}
                aria-selected={tipo === t}
                aria-controls="pannello-documento"
                className={`-mb-px rounded-t-md border px-3 py-1.5 text-sm ${
                  tipo === t
                    ? "border-border border-b-surface bg-surface font-medium text-text-1"
                    : "border-transparent text-text-3 hover:text-text-1"
                }`}
                onClick={() => setTipo(t)}
              >
                {NOMI[t]}
              </button>
            ))}
          </div>
          <div
            id="pannello-documento"
            role="tabpanel"
            aria-labelledby={`scheda-${tipo}`}
            className="mt-4 space-y-4"
          >
            <div>
              <label className="label" htmlFor="doc-titolo">
                Titolo stampato
              </label>
              <input
                id="doc-titolo"
                className="input"
                maxLength={60}
                value={doc.titolo}
                disabled={TITOLO_FISSO.has(tipo)}
                onChange={(e) => aggiornaDoc({ titolo: e.target.value })}
              />
              {TITOLO_FISSO.has(tipo) && (
                <p className="mt-1 text-xs text-text-3">
                  Titolo fisso: il documento non è la fattura elettronica e non
                  deve sembrarlo (art. 6 D.Lgs. 471/1997). L&apos;avvertenza a
                  piè di pagina resta sempre stampata.
                </p>
              )}
            </div>
            <div>
              <label className="label" htmlFor="doc-iniziale">
                Testo prima delle righe
              </label>
              <textarea
                id="doc-iniziale"
                className="input min-h-20"
                maxLength={2000}
                placeholder="Es.: Gentile {destinatario}, come concordato le inviamo…"
                value={doc.testoIniziale}
                onChange={(e) => aggiornaDoc({ testoIniziale: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="doc-finale">
                Testo dopo i totali
              </label>
              <textarea
                id="doc-finale"
                className="input min-h-24"
                maxLength={2000}
                placeholder="Es.: condizioni di pagamento, garanzia, tempi di intervento…"
                value={doc.testoFinale}
                onChange={(e) => aggiornaDoc({ testoFinale: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="doc-piede">
                Nota a piè di pagina per questo documento
              </label>
              <input
                id="doc-piede"
                className="input"
                maxLength={500}
                value={doc.notaPiede}
                onChange={(e) => aggiornaDoc({ notaPiede: e.target.value })}
              />
              <p className="mt-1 text-xs text-text-3">
                Si aggiunge alla nota generale dei dati aziendali.
              </p>
            </div>
            {tipo !== "libretto" && (
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-text-1">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-accent"
                    checked={doc.mostraIban}
                    onChange={(e) =>
                      aggiornaDoc({ mostraIban: e.target.checked })
                    }
                  />
                  Stampa l&apos;IBAN a piè di pagina
                </label>
                {(tipo === "preventivo" || tipo === "ddt") && (
                  <label className="flex items-center gap-2 text-sm text-text-1">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-accent"
                      checked={doc.firmaAccettazione}
                      onChange={(e) =>
                        aggiornaDoc({ firmaAccettazione: e.target.checked })
                      }
                    />
                    {tipo === "ddt"
                      ? "Spazio per la firma del destinatario (ricevuta della merce)"
                      : "Spazio «Per accettazione» (timbro e firma del cliente)"}
                  </label>
                )}
              </div>
            )}
            <details className="rounded-md bg-surface-2 px-3 py-2 text-sm">
              <summary className="cursor-pointer text-text-2">
                Campi utilizzabili nei testi
              </summary>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {Object.entries(SEGNAPOSTI).map(([k, v]) => (
                  <li key={k} className="text-text-2">
                    <code className="font-mono text-text-1">{`{${k}}`}</code> —{" "}
                    {v}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </section>

        {esito && (
          <p
            role={esito.ok ? "status" : "alert"}
            className={`rounded-md px-3 py-2 text-sm ${
              esito.ok
                ? "bg-success-subtle text-success-text"
                : "bg-danger-subtle text-danger-text"
            }`}
          >
            {esito.testo}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={inCorso !== null}
            onClick={() => void anteprima()}
          >
            {inCorso === "anteprima"
              ? "Preparazione…"
              : `Anteprima: ${NOMI[tipo]}`}
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={inCorso !== null || !datiPresenti}
          >
            {inCorso === "salva" ? "Salvataggio…" : "Salva modello"}
          </button>
        </div>
      </form>
    </div>
  );
}
