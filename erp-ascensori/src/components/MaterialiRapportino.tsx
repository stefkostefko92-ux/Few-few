"use client";

// Вложените материали по един отчет.
//
// Артикулът се избира от склада, а не се пише на ръка: свободният текст е точно
// това, което дотук правеше наличността невярна. Наличността се сваля веднага —
// затова тук се показва и колко остава, докато корекцията още е възможна.
//
// Подписаният отчет е само за четене. Заключването не е тук за красота: под
// подписа на клиента стои и вложеното, което той плаща.

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/fetch-client";
import { IcoNuovoPiccolo, IcoElimina } from "@/components/icone";

interface Riga {
  id: string;
  quantita: number;
  articolo: { codice: string; nome: string; quantita?: number };
}

interface Articolo {
  id: string;
  codice: string;
  nome: string;
  quantita: number;
}

export default function MaterialiRapportino({
  rapportinoId,
  bloccato,
  onCambio,
}: {
  rapportinoId: string;
  /** Подписан отчет: показва се, не се пипа. */
  bloccato: boolean;
  /** Складът се е раздвижил — извикващият може да опресни своите числа. */
  onCambio?: () => void;
}) {
  const [righe, setRighe] = useState<Riga[]>([]);
  const [articoli, setArticoli] = useState<Articolo[]>([]);
  const [articoloId, setArticoloId] = useState("");
  const [quantita, setQuantita] = useState("1");
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const carica = useCallback(async () => {
    const { ok, dati } = await apiFetch<{ righe: Riga[] }>(
      `/api/rapportini/${rapportinoId}/materiali`,
    );
    if (ok) setRighe(dati.righe ?? []);
  }, [rapportinoId]);

  useEffect(() => {
    void carica();
  }, [carica]);

  useEffect(() => {
    if (bloccato) return; // подписан отчет не иска списък за избор
    void apiFetch<{ righe: Articolo[] }>("/api/articoli?size=200").then(
      ({ ok, dati }) => {
        if (ok) setArticoli(dati.righe ?? []);
      },
    );
  }, [bloccato]);

  async function aggiungi(e: React.FormEvent) {
    e.preventDefault();
    if (inCorso || !articoloId) return;
    setInCorso(true);
    setErrore(null);
    try {
      const { ok, dati } = await apiFetch<{ error?: string }>(
        `/api/rapportini/${rapportinoId}/materiali`,
        {
          method: "POST",
          body: JSON.stringify({
            articoloId,
            quantita: Number(quantita),
          }),
        },
      );
      if (!ok) {
        // Съобщението от сървъра е конкретно („disponibili 2") — по-полезно от
        // каквото и да е общо изречение тук.
        setErrore(dati.error ?? "Errore");
        return;
      }
      setArticoloId("");
      setQuantita("1");
      await carica();
      onCambio?.();
    } finally {
      setInCorso(false);
    }
  }

  async function rimuovi(rigaId: string) {
    if (inCorso) return;
    setInCorso(true);
    setErrore(null);
    try {
      const { ok, dati } = await apiFetch<{ error?: string }>(
        `/api/rapportini/${rapportinoId}/materiali/${rigaId}`,
        { method: "DELETE" },
      );
      if (!ok) {
        setErrore(dati.error ?? "Errore");
        return;
      }
      await carica();
      onCambio?.();
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="mt-3 rounded-md bg-surface-2 p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-2">
        Materiali da magazzino
      </h4>

      {righe.length === 0 ? (
        <p className="text-xs text-text-3">
          Nessun materiale prelevato per questo intervento.
        </p>
      ) : (
        <ul className="mb-2 space-y-1">
          {righe.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="min-w-0 truncate text-text-2">
                <span className="font-mono">{r.articolo.codice}</span>{" "}
                {r.articolo.nome}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-mono font-medium text-text-1">
                  {r.quantita}
                </span>
                {!bloccato && (
                  <button
                    type="button"
                    className="btn-ghost inline-flex h-6 items-center gap-1 px-1.5"
                    onClick={() => void rimuovi(r.id)}
                    disabled={inCorso}
                    // Иконата сама не носи смисъл: действието е и в текста.
                    aria-label={`Rimuovi ${r.articolo.codice} e riportarlo a magazzino`}
                  >
                    <IcoElimina />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!bloccato && (
        <form onSubmit={aggiungi} className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label
              className="label text-[11px]"
              htmlFor={`mat-art-${rapportinoId}`}
            >
              Articolo
            </label>
            <select
              id={`mat-art-${rapportinoId}`}
              className="input h-8 text-xs"
              value={articoloId}
              onChange={(e) => setArticoloId(e.target.value)}
            >
              <option value="">— selezionare —</option>
              {articoli.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codice} · {a.nome} (disp. {a.quantita})
                </option>
              ))}
            </select>
          </div>
          <div className="w-20">
            <label
              className="label text-[11px]"
              htmlFor={`mat-qta-${rapportinoId}`}
            >
              Quantità
            </label>
            <input
              id={`mat-qta-${rapportinoId}`}
              className="input h-8 text-xs"
              type="number"
              min={1}
              value={quantita}
              onChange={(e) => setQuantita(e.target.value)}
            />
          </div>
          <button
            className="btn-secondary inline-flex h-8 items-center gap-1 px-3 text-xs"
            disabled={inCorso || !articoloId}
          >
            <IcoNuovoPiccolo />
            Preleva
          </button>
        </form>
      )}

      {errore && (
        <p className="mt-2 text-xs text-danger-text" role="alert">
          {errore}
        </p>
      )}
    </div>
  );
}
