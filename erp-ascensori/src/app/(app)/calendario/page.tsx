"use client";

// Календарът на обиколките.
//
// Диспечерът не пита „кои ордини са отворени", а „свободен ли е Марко в
// четвъртък". Затова тук месецът е мрежа от цели седмици, а не списък: окото
// намира дупката за секунда, а списък, подреден по дата, иска четене.
//
// Трите вида ангажимент (ордин, посещение по договор, изтичащ нормативен срок)
// стоят ЗАЕДНО. Показани поотделно, те карат човека да сглобява наум — а точно
// там се раждат двойните насрочвания.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/fetch-client";
import { GIORNI_IT, MESI_IT } from "@/lib/calendario";
import { IcoIndietro, IcoVerso, IcoAttenzione } from "@/components/icone";

interface Impegno {
  id: string;
  titolo: string;
  tecnico: string | null;
  tipo: "ordine" | "visita" | "verifica";
  priorita: string | null;
  impianto: string | null;
}

interface Carico {
  tecnico: string;
  ore: number;
  interventi: number;
  sovraccarico: boolean;
}

interface Giorno {
  chiave: string;
  fuoriPeriodo: boolean;
  impegni: Impegno[];
  carico: Carico[];
}

interface Dati {
  anno: number;
  mese: number;
  giorni: Giorno[];
  totale: number;
}

/** Видът се чете и без цвят: етикетът е част от реда. */
const ETICHETTA_TIPO: Record<Impegno["tipo"], string> = {
  ordine: "Ordine",
  visita: "Visita",
  verifica: "Scadenza",
};

const STILE_TIPO: Record<Impegno["tipo"], string> = {
  ordine: "border-l-accent",
  visita: "border-l-chart-3",
  verifica: "border-l-warning",
};

export default function Pagina() {
  const oggi = new Date();
  const [anno, setAnno] = useState(oggi.getFullYear());
  const [mese, setMese] = useState(oggi.getMonth() + 1);
  const [d, setD] = useState<Dati | null>(null);

  const carica = useCallback(async () => {
    const { ok, dati } = await apiFetch<Dati>(
      `/api/calendario?anno=${anno}&mese=${mese}`,
    );
    if (ok) setD(dati);
  }, [anno, mese]);

  useEffect(() => {
    void carica();
  }, [carica]);

  function sposta(delta: number) {
    const m = mese + delta;
    if (m < 1) {
      setMese(12);
      setAnno(anno - 1);
    } else if (m > 12) {
      setMese(1);
      setAnno(anno + 1);
    } else setMese(m);
  }

  const chiaveOggi = [
    oggi.getFullYear(),
    String(oggi.getMonth() + 1).padStart(2, "0"),
    String(oggi.getDate()).padStart(2, "0"),
  ].join("-");

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-1">
            Calendario interventi
          </h1>
          <p className="mt-1 text-sm text-text-3">
            Ordini, visite da contratto e scadenze normative in un unico piano.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost inline-flex h-8 items-center gap-1 px-2 text-xs"
            onClick={() => sposta(-1)}
            aria-label="Mese precedente"
          >
            <IcoIndietro />
          </button>
          <span className="min-w-40 text-center text-sm font-medium text-text-1">
            {MESI_IT[mese - 1]} {anno}
          </span>
          <button
            className="btn-ghost inline-flex h-8 items-center gap-1 px-2 text-xs"
            onClick={() => sposta(1)}
            aria-label="Mese successivo"
          >
            <IcoVerso />
          </button>
          <button
            className="btn-secondary h-8 px-3 text-xs"
            onClick={() => {
              setAnno(oggi.getFullYear());
              setMese(oggi.getMonth() + 1);
            }}
          >
            Oggi
          </button>
        </div>
      </header>

      {!d ? (
        <p className="text-sm text-text-3">…</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div className="min-w-3xl">
              <div className="grid grid-cols-7 gap-px">
                {GIORNI_IT.map((g) => (
                  <div
                    key={g}
                    className="pb-1 text-center text-xs font-medium text-text-3"
                  >
                    {g}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px rounded-md bg-border">
                {d.giorni.map((g) => {
                  const numero = Number(g.chiave.slice(-2));
                  const sovraccarico = g.carico.some((c) => c.sovraccarico);
                  return (
                    <div
                      key={g.chiave}
                      // Дните извън месеца се различават по ФОН, не по
                      // прозрачност: `opacity` дели контраста на текста наполовина
                      // и сваля клетката под прага по WCAG 1.4.3 — проверено с axe.
                      className={`min-h-28 p-1.5 ${
                        g.fuoriPeriodo ? "bg-surface-2" : "bg-surface"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={`text-xs ${
                            g.chiave === chiaveOggi
                              ? "rounded-full bg-accent px-1.5 py-0.5 font-semibold text-text-inverse"
                              : "text-text-3"
                          }`}
                        >
                          {numero}
                        </span>
                        {sovraccarico && (
                          <span
                            className="inline-flex items-center text-warning-text"
                            title="Giornata sovraccarica"
                          >
                            <IcoAttenzione />
                          </span>
                        )}
                      </div>
                      <ul className="space-y-1">
                        {g.impegni.slice(0, 4).map((i) => (
                          <li key={`${i.tipo}-${i.id}`}>
                            <Link
                              href={
                                i.tipo === "ordine"
                                  ? `/ordini/${i.id}`
                                  : i.tipo === "visita"
                                    ? `/contratti`
                                    : `/scadenze`
                              }
                              className={`block truncate border-l-2 pl-1.5 text-[11px] hover:underline ${STILE_TIPO[i.tipo]}`}
                              title={`${ETICHETTA_TIPO[i.tipo]} · ${i.titolo}${
                                i.tecnico ? ` · ${i.tecnico}` : ""
                              }`}
                            >
                              <span className="text-text-3">
                                {ETICHETTA_TIPO[i.tipo]}
                              </span>{" "}
                              <span className="text-text-2">{i.titolo}</span>
                            </Link>
                          </li>
                        ))}
                        {g.impegni.length > 4 && (
                          <li className="pl-1.5 text-[11px] text-text-3">
                            +{g.impegni.length - 4} altri
                          </li>
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-text-3">
            {d.totale} impegni nel mese. Le ore stimate per ordine non sono
            note in anticipo: il carico giornaliero segnala solo il numero di
            interventi assegnati, non un monte ore.
          </p>
        </>
      )}
    </div>
  );
}
