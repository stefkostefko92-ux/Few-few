"use client";

// Детайл на DDT: редове на превозената стока + свързани складови движения.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import VociEditor, { type VoceRiga } from "@/components/VociEditor";
import { ScheletroDettaglio } from "@/components/ui";
import { IcoIndietro, IcoStampa } from "@/components/icone";
import { dataIt } from "@/lib/format";

interface DdtDettaglio {
  id: string;
  numero: string;
  data: string;
  causale: string | null;
  destinatario: string | null;
  indirizzoConsegna: string | null;
  vettore: string | null;
  ordineLavoro: { numero: string; oggetto: string } | null;
  righe: VoceRiga[];
  movimenti: {
    id: string;
    tipo: string;
    quantita: number;
    articolo: { codice: string; nome: string };
  }[];
}

export default function Pagina() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<DdtDettaglio | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useCallback(async () => {
    const res = await fetch(`/api/ddt/${id}`);
    if (!res.ok) {
      setErrore("DDT non trovato");
      return;
    }
    setD(await res.json());
  }, [id]);

  useEffect(() => {
    void carica();
  }, [carica]);

  if (errore) return <p className="text-text-3">{errore}</p>;
  if (!d) return <ScheletroDettaglio />;

  return (
    <div>
      <button className="btn-ghost mb-4 h-8 px-2 text-xs" onClick={() => router.push("/ddt")}>
        <IcoIndietro />
        DDT
      </button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="font-mono text-2xl font-semibold tracking-tight text-text-1">{d.numero}</h1>
        <p className="mt-1 text-xs text-text-3">
          {dataIt(d.data)} · {d.causale ?? "—"} · {d.destinatario ?? "—"}
          {d.indirizzoConsegna ? ` · ${d.indirizzoConsegna}` : ""} · vettore:{" "}
          {d.vettore ?? "mittente"}
          {d.ordineLavoro ? ` · ordine ${d.ordineLavoro.numero}` : ""}
        </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            className="btn-secondary inline-flex items-center gap-1.5"
            href={`/api/ddt/${id}/pdf`}
            target="_blank"
            rel="noopener"
          >
            <IcoStampa />
            Stampa
          </a>
        </div>
      </div>

      <div className="card mb-6 p-5">
        <h2 className="mb-4 text-lg font-semibold text-text-1">Merce trasportata</h2>
        <VociEditor
          api={`/api/ddt/${id}/righe`}
          voci={d.righe}
          conPrezzi={false}
          onCambiato={() => void carica()}
        />
      </div>

      {d.movimenti.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 text-lg font-semibold text-text-1">
            Movimenti di magazzino collegati
          </h2>
          <ul className="space-y-1 text-sm">
            {d.movimenti.map((m) => (
              <li key={m.id}>
                <span className="font-mono">{m.articolo.codice}</span> · {m.articolo.nome} —{" "}
                {m.tipo} {m.quantita}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
