"use client";

// Пакетът за предаване на счетоводителя.
//
// ЗАЩО СЪЩЕСТВУВА ТАЗИ СТРАНИЦА. Маршрутът `/api/fatture/conservazione`
// работеше, но нямаше НИТО ЕДИН бутон към него: функция, продавана на
// commercialista-та, беше достижима само с ръчно въведен адрес. Работеща
// функция без вход е равна на липсваща.
//
// И ЗАЩО ИМЕТО НЕ Е „conservazione a norma". Пакетът НЕ е съхранение по
// норма — то е услуга на акредитиран доставчик, с времеви печати и метаданни
// по Насоките на AgID. Тук се произвежда ПРАТКА ЗА ПРЕДАВАНЕ: подредени и
// проверими файлове. README-то вътре го казва изрично; заглавието не бива да
// казва обратното.

import { useState } from "react";
import { IcoNota } from "@/components/icone";

/** Първият ден на текущата година — обичайното начало на такава пратка. */
function inizioAnno(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function oggiIso(): string {
  const d = new Date();
  const due = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;
}

export default function Pagina() {
  const [dal, setDal] = useState(inizioAnno);
  const [al, setAl] = useState(oggiIso);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);

  async function scarica(e: React.FormEvent) {
    e.preventDefault();
    if (inCorso) return;
    if (dal > al) {
      setErrore("Il periodo è invertito: la data iniziale è dopo la finale.");
      return;
    }
    setInCorso(true);
    setErrore(null);
    setEsito(null);
    try {
      const res = await fetch(
        `/api/fatture/conservazione?dal=${dal}&al=${al}`,
        { credentials: "same-origin" },
      );
      if (!res.ok) {
        const dati = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setErrore(dati?.error ?? "Errore imprevisto: riprovare.");
        return;
      }
      const documenti = res.headers.get("X-Documenti") ?? "?";
      const scartate = res.headers.get("X-Scartate") ?? "0";
      const blob = await res.blob();
      // Свалянето минава през временна връзка: така файлът стига до диска с
      // името, което сървърът е дал, без да се измисля тук второ.
      const nome =
        /filename="([^"]+)"/.exec(
          res.headers.get("content-disposition") ?? "",
        )?.[1] ?? "pacchetto.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.click();
      URL.revokeObjectURL(url);
      setEsito(
        `${documenti} ${documenti === "1" ? "documento" : "documenti"} nel pacchetto${
          scartate !== "0"
            ? ` · ${scartate} esclusi perché non conformi ai controlli dello SdI`
            : ""
        }.`,
      );
    } catch {
      setErrore("Errore di rete: riprovare.");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-1">
          Pacchetto di versamento
        </h1>
        <p className="mt-1 text-sm text-text-3">
          Le fatture emesse del periodo, in formato XML come sono state emesse,
          con un indice e l&apos;impronta SHA-256 di ogni file: è quanto si
          consegna al conservatore o al commercialista.
        </p>
      </header>

      <form onSubmit={scarica} className="card space-y-4 p-5">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="label" htmlFor="dal">
              Dal
            </label>
            <input
              id="dal"
              type="date"
              className="input w-44"
              value={dal}
              onChange={(e) => setDal(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="al">
              Al
            </label>
            <input
              id="al"
              type="date"
              className="input w-44"
              value={al}
              onChange={(e) => setAl(e.target.value)}
              required
            />
          </div>
        </div>

        <p className="flex items-start gap-2 text-xs text-warning-text">
          <IcoNota />
          <span>
            {/* Плътен правен абзац се прескача след първия прочит — а точно
                тази страница се отваря веднъж на тримесечие. Носещата фраза
                остава видима и при сканиране; останалото е за първия път. */}
            <strong className="font-semibold">
              Questo non è un sistema di conservazione a norma.
            </strong>{" "}
            Quella è svolta da un conservatore, con marche temporali e metadati
            secondo le Linee guida AgID. L&apos;obbligo di conservazione resta
            in capo al contribuente (art. 39 D.P.R. 633/1972, art. 2220 c.c.).
            Le bozze non entrano nel pacchetto.
          </span>
        </p>

        <button className="btn-primary" disabled={inCorso}>
          {inCorso ? "Preparazione…" : "Scarica il pacchetto"}
        </button>

        {esito && (
          <p className="text-sm text-success-text" role="status">
            {esito}
          </p>
        )}
        {errore && (
          <p className="text-sm text-danger-text" role="alert">
            {errore}
          </p>
        )}
      </form>
    </div>
  );
}
