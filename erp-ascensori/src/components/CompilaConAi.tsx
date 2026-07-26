"use client";

// „Compila con l'AI“ — качва документ и предлага стойности за формата.
//
// Ключовата дума е ПРЕДЛАГА. Нищо не се записва и нищо не се попълва само:
// операторът вижда какво е прочетено, поле по поле, и решава. Автоматичното
// попълване без преглед изглежда по-удобно точно докато не влезе измислен
// данъчен номер във фактура.
//
// Три неща в поведението, които не са козметика:
//
//   1. Полетата, които формата ВЕЧЕ има попълнени, са отбелязани и по
//      подразбиране НЕ се приемат. Работата на човека не се презаписва от
//      машина, освен ако той не каже.
//   2. Отпадналите полета се ПОКАЗВАТ. „AI-ят не намери нищо“ и „AI-ят намери
//      нещо, което ние отхвърлихме“ са различни неща и операторът трябва да ги
//      различава — второто често значи, че документът е нечетлив.
//   3. Предупреждението стои до самите стойности, не веднъж в настройките.

import { useEffect, useState } from "react";
import { IcoAttenzione, IcoNota, IcoFatto } from "@/components/icone";
import { TIPI_PERMESSI, DIMENSIONE_MASSIMA } from "@/lib/allegati/tipi";

interface Scartato {
  campo: string;
  motivo: string;
}

interface Esito {
  campi: Record<string, unknown>;
  scartati: Scartato[];
  fornitore: string;
  avvertenza: string;
}

interface StatoAi {
  attiva: boolean;
  fornitore: string;
  moduli: Record<string, { titolo: string; documentoAtteso: string }>;
}

/** Кешира отговора: състоянието е едно за цялата сесия, не за всяка форма. */
let statoCache: Promise<StatoAi | null> | null = null;
function caricaStato(): Promise<StatoAi | null> {
  statoCache ??= fetch("/api/ai/estrai")
    .then((r) => (r.ok ? (r.json() as Promise<StatoAi>) : null))
    .catch(() => null);
  return statoCache;
}

export default function CompilaConAi({
  modulo,
  etichette,
  valoriAttuali,
  onCompila,
}: {
  /** Името на модула в сървърния регистър (`condomini`, `impianti`…). */
  modulo: string;
  /** Италианските етикети на полетата, за да се чете предложението. */
  etichette: Record<string, string>;
  /** Какво вече е попълнено — за да не се презаписва мълчаливо. */
  valoriAttuali?: Record<string, unknown>;
  onCompila: (campi: Record<string, unknown>) => void;
}) {
  const [stato, setStato] = useState<StatoAi | null>(null);
  const [pronto, setPronto] = useState(false);
  const [esito, setEsito] = useState<Esito | null>(null);
  const [scelti, setScelti] = useState<Record<string, boolean>>({});
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => {
    let vivo = true;
    void caricaStato().then((s) => {
      if (!vivo) return;
      setStato(s);
      setPronto(true);
    });
    return () => {
      vivo = false;
    };
  }, []);

  // Изключената функция не оставя следа в интерфейса: бутон, който само дава
  // грешка, е по-лош от липсващ бутон.
  if (!pronto || !stato?.attiva || !stato.moduli[modulo]) return null;
  const info = stato.moduli[modulo];

  async function leggi(file: File) {
    setErrore(null);
    setEsito(null);
    if (file.size > DIMENSIONE_MASSIMA) {
      setErrore(
        `Documento troppo grande: massimo ${Math.floor(DIMENSIONE_MASSIMA / 1048576)} MB.`,
      );
      return;
    }
    setInCorso(true);
    try {
      const corpo = new FormData();
      corpo.set("file", file);
      corpo.set("modulo", modulo);
      const res = await fetch("/api/ai/estrai", {
        method: "POST",
        body: corpo,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrore(
          (d as { error?: string }).error ??
            "Errore nella lettura del documento.",
        );
        return;
      }
      const e = d as Esito;
      setEsito(e);
      // Предварителният избор е половината от предпазителя: пипаме само
      // празните полета, а върху попълнените операторът решава изрично.
      setScelti(
        Object.fromEntries(
          Object.keys(e.campi).map((k) => {
            const attuale = valoriAttuali?.[k];
            const vuoto =
              attuale === undefined || attuale === null || attuale === "";
            return [k, vuoto];
          }),
        ),
      );
    } finally {
      setInCorso(false);
    }
  }

  function applica() {
    if (!esito) return;
    onCompila(
      Object.fromEntries(
        Object.entries(esito.campi).filter(([k]) => scelti[k]),
      ),
    );
    setEsito(null);
  }

  const quanti = esito ? Object.values(scelti).filter(Boolean).length : 0;

  return (
    <div className="mb-4 rounded-md border border-border bg-surface-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-text-1">
            Compila da un documento
          </p>
          <p className="text-xs text-text-3">{info.documentoAtteso}</p>
          {/* РАЗКРИВАНЕТО Е ПРЕДИ КАЧВАНЕТО, не след него. Дотук изречението
              „Documento inviato a …" се появяваше чак в блока с резултата —
              тоест документът вече беше излязъл от сървъра, когато човекът
              научава къде отива. Прозрачността по чл. 5(1)(а) и чл. 12(1)
              ОРЗД е ПРЕДИ обработката. */}
          {stato.fornitore && (
            <p className="mt-1 text-xs text-warning-text">
              Il documento sarà inviato a {stato.fornitore} per la lettura.
            </p>
          )}
        </div>
        <input
          type="file"
          className="input h-8 w-auto py-1 text-xs"
          accept={TIPI_PERMESSI.map((t) => t.mime).join(",")}
          disabled={inCorso}
          aria-label="Documento da leggere con l'AI"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void leggi(f);
            e.target.value = "";
          }}
        />
      </div>

      {inCorso && (
        <p className="mt-2 text-xs text-text-3" role="status">
          Lettura in corso…
        </p>
      )}

      {errore && (
        <p
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text"
        >
          <IcoAttenzione />
          {errore}
        </p>
      )}

      {esito && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-2 flex items-start gap-2 text-xs text-warning-text">
            <IcoNota />
            <span>
              {esito.avvertenza} Documento inviato a {esito.fornitore}.
            </span>
          </p>

          {Object.keys(esito.campi).length === 0 ? (
            <p className="text-sm text-text-3">
              Nessun dato riconosciuto in questo documento.
            </p>
          ) : (
            <>
              <ul className="space-y-1">
                {Object.entries(esito.campi).map(([k, v]) => {
                  const attuale = valoriAttuali?.[k];
                  const occupato = !(
                    attuale === undefined ||
                    attuale === null ||
                    attuale === ""
                  );
                  return (
                    <li key={k}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-sm hover:bg-surface-3">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4"
                          checked={scelti[k] ?? false}
                          onChange={(e) =>
                            setScelti({ ...scelti, [k]: e.target.checked })
                          }
                        />
                        <span>
                          <span className="text-text-3">
                            {etichette[k] ?? k}:
                          </span>{" "}
                          <span className="font-medium">{String(v)}</span>
                          {occupato && (
                            <span className="ml-1 text-xs text-warning-text">
                              — sostituisce «{String(attuale)}»
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className="btn-primary mt-2 inline-flex items-center gap-1.5"
                disabled={quanti === 0}
                onClick={applica}
              >
                <IcoFatto />
                Applica {quanti} {quanti === 1 ? "campo" : "campi"}
              </button>
            </>
          )}

          {esito.scartati.length > 0 && (
            <details className="mt-2 text-xs text-text-3">
              <summary className="cursor-pointer">
                {esito.scartati.length} valori non accettati
              </summary>
              <ul className="mt-1 list-disc pl-5">
                {esito.scartati.map((s) => (
                  <li key={s.campo}>
                    <span className="font-medium">
                      {etichette[s.campo] ?? s.campo}
                    </span>
                    : {s.motivo}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
