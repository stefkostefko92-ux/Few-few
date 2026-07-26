"use client";

// Прикачените файлове на един запис.
//
// Един компонент за всички същности: уредба, проверка, поръчка, рапортичка.
// Затова приема `entita` и `entitaId` — същите, които сървърът проверява срещу
// затворения си списък.

import { useCallback, useEffect, useRef, useState } from "react";
import { IcoEsporta, IcoElimina, IcoAttenzione } from "@/components/icone";
import { dataIt } from "@/lib/format";
import { TIPI_PERMESSI, DIMENSIONE_MASSIMA } from "@/lib/allegati/tipi";

interface Allegato {
  id: string;
  nome: string;
  mimeType: string;
  dimensione: number;
  sha256: string;
  createdAt: string;
}

/** Размер за човек: „1,4 MB“, не „1468006“. */
function dimensione(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(0)} kB`;
  return `${(byte / (1024 * 1024)).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB`;
}

export default function Allegati({
  entita,
  entitaId,
  titolo = "Allegati",
  soloLettura,
}: {
  entita: string;
  entitaId: string;
  titolo?: string;
  soloLettura?: boolean;
}) {
  const [righe, setRighe] = useState<Allegato[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const carica = useCallback(async () => {
    const res = await fetch(
      `/api/allegati?entita=${encodeURIComponent(entita)}&entitaId=${encodeURIComponent(entitaId)}`,
    );
    if (res.ok) setRighe((await res.json()).righe);
  }, [entita, entitaId]);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function invia(file: File) {
    setErrore(null);
    // Проверката пред качването е УДОБСТВО, не защита: сървърът я прави пак и
    // по СЪДЪРЖАНИЕ. Тук само спестява на техника 20 MB през мобилна мрежа,
    // за да получи после отказ.
    if (file.size > DIMENSIONE_MASSIMA) {
      setErrore(
        `File troppo grande: massimo ${Math.floor(DIMENSIONE_MASSIMA / 1048576)} MB.`,
      );
      return;
    }
    setCaricamento(true);
    try {
      const corpo = new FormData();
      corpo.set("file", file);
      corpo.set("entita", entita);
      corpo.set("entitaId", entitaId);
      const res = await fetch("/api/allegati", { method: "POST", body: corpo });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErrore(d.error ?? "Errore durante il caricamento");
        return;
      }
      await carica();
      if (input.current) input.current.value = "";
    } finally {
      setCaricamento(false);
    }
  }

  async function rimuovi(a: Allegato) {
    if (!confirm(`Eliminare «${a.nome}»?`)) return;
    const res = await fetch(`/api/allegati/${a.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErrore(d.error ?? "Errore");
      return;
    }
    void carica();
  }

  const accettati = TIPI_PERMESSI.map((t) => t.mime).join(",");

  return (
    <div className="card p-5">
      <h2 className="mb-3 text-lg font-semibold text-text-1">{titolo}</h2>

      {righe.length === 0 ? (
        <p className="mb-3 text-sm text-text-3">Nessun allegato.</p>
      ) : (
        <ul className="mb-3 space-y-1 text-sm">
          {righe.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2">
              <a
                className="inline-flex items-center gap-1.5 text-accent-text hover:underline"
                href={`/api/allegati/${a.id}`}
                download={a.nome}
              >
                <IcoEsporta />
                {a.nome}
              </a>
              <span className="flex items-center gap-3 text-xs text-text-3">
                <span className="font-mono">{dimensione(a.dimensione)}</span>
                <span>{dataIt(a.createdAt)}</span>
                {!soloLettura && (
                  <button
                    className="btn-ghost h-6 px-1"
                    aria-label={`Elimina ${a.nome}`}
                    onClick={() => void rimuovi(a)}
                  >
                    <IcoElimina />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {errore && (
        <p
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text"
        >
          <IcoAttenzione />
          {errore}
        </p>
      )}

      {!soloLettura && (
        <div className="border-t border-border pt-3">
          <label className="label" htmlFor={`file-${entitaId}`}>
            Aggiungi allegato
          </label>
          <input
            id={`file-${entitaId}`}
            ref={input}
            type="file"
            className="input py-1.5"
            accept={accettati}
            disabled={caricamento}
            aria-describedby={`file-aiuto-${entitaId}`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void invia(f);
            }}
          />
          <p id={`file-aiuto-${entitaId}`} className="mt-1 text-xs text-text-3">
            {TIPI_PERMESSI.map((t) => t.etichetta).join(", ")} · max{" "}
            {Math.floor(DIMENSIONE_MASSIMA / 1048576)} MB
            {caricamento ? " · caricamento in corso…" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
