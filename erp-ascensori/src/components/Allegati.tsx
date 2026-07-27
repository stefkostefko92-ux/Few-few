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

/**
 * Снимка ли е — по типа, ПОДУШЕН на сървъра, не по разширението в името.
 *
 * ЗАЩО ИЗОБЩО. За асансьорна фирма прикаченото най-често е СНИМКА: табелката с
 * матриколата, скъсаното въже, повредата, за която се спори кой я е причинил.
 * Списък с имена на файлове иска отваряне на всеки поотделно — на телефон, в
 * машинното, с една ръка. Решетка от миниатюри е самата функция.
 */
function eImmagine(mimeType: string): boolean {
  return mimeType.startsWith("image/");
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

  async function invia(file: File): Promise<boolean> {
    setErrore(null);
    // Проверката пред качването е УДОБСТВО, не защита: сървърът я прави пак и
    // по СЪДЪРЖАНИЕ. Тук само спестява на техника 20 MB през мобилна мрежа,
    // за да получи после отказ.
    if (file.size > DIMENSIONE_MASSIMA) {
      setErrore(
        `«${file.name}» è troppo grande: massimo ${Math.floor(DIMENSIONE_MASSIMA / 1048576)} MB.`,
      );
      return false;
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
        return false;
      }
      await carica();
      return true;
    } finally {
      setCaricamento(false);
    }
  }

  /** Едно по едно, не паралелно: сървърът пише файл + ред, а мобилната мрежа
   *  не обича шест едновременни качвания. Първата грешка спира останалите —
   *  иначе човекът вижда едно съобщение и не знае кои са минали. */
  async function inviaTutti(files: File[]) {
    for (const f of files) {
      const ok = await invia(f);
      if (!ok) break;
    }
    if (input.current) input.current.value = "";
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
  const immagini = righe.filter((a) => eImmagine(a.mimeType));
  const documenti = righe.filter((a) => !eImmagine(a.mimeType));

  return (
    <div className="card p-5">
      <h2 className="mb-3 text-lg font-semibold text-text-1">{titolo}</h2>

      {righe.length === 0 && (
        <p className="mb-3 text-sm text-text-3">Nessun allegato.</p>
      )}

      {immagini.length > 0 && (
        <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {immagini.map((a) => (
            <li key={a.id} className="group relative">
              <a
                href={`/api/allegati/${a.id}?anteprima=1`}
                target="_blank"
                rel="noopener"
                className="block overflow-hidden rounded-md border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {/* Не `next/image`: файлът минава през маршрут с проверка на
                    роля и фирма, тоест не е статичен ресурс, който
                    оптимизаторът може да вземе. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/allegati/${a.id}?anteprima=1`}
                  alt={a.nome}
                  loading="lazy"
                  className="aspect-4/3 w-full bg-surface-2 object-cover"
                />
              </a>
              <div className="mt-1 flex items-start justify-between gap-1">
                <span className="truncate text-xs text-text-2" title={a.nome}>
                  {a.nome}
                </span>
                {!soloLettura && (
                  <button
                    className="btn-ghost -mt-1 h-8 shrink-0 px-1"
                    aria-label={`Elimina ${a.nome}`}
                    onClick={() => void rimuovi(a)}
                  >
                    <IcoElimina />
                  </button>
                )}
              </div>
              <span className="text-xs text-text-3">{dataIt(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}

      {documenti.length > 0 && (
        <ul className="mb-3 space-y-1 text-sm">
          {documenti.map((a) => (
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
                    className="btn-ghost h-8 px-1"
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
            // НЯКОЛКО НАВЕДНЪЖ. Техникът снима шест кадъра в машинното; шест
            // отделни качвания на мобилна мрежа са шест повода да се откаже.
            multiple
            disabled={caricamento}
            aria-describedby={`file-aiuto-${entitaId}`}
            onChange={(e) => {
              const f = Array.from(e.target.files ?? []);
              if (f.length) void inviaTutti(f);
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
