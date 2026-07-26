"use client";

// Кои доставки покрива фактурата — отложеното фактуриране на практика.
//
// Екранът заменя справката, която иначе се прави на ръка в края на месеца:
// „кои DDT още не са фактурирани". Свързването СМЕНЯ типа на документа за SDI
// (TD01 → TD24), затова това е написано на самия екран — иначе изглежда като
// подредба на папки, а е фискално решение.

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/fetch-client";
import { dataIt } from "@/lib/format";
import { IcoIntegro } from "@/components/icone";

interface Voce {
  id: string;
  numero: string;
  data: string;
  destinatario: string | null;
}

export default function DdtFattura({
  fatturaId,
  onCambio,
}: {
  fatturaId: string;
  /** Типът на документа се е сменил — извикващият опреснява проверката за SDI. */
  onCambio?: () => void;
}) {
  const [collegati, setCollegati] = useState<Voce[]>([]);
  const [disponibili, setDisponibili] = useState<Voce[]>([]);
  const [modificabile, setModificabile] = useState(false);
  const [scelti, setScelti] = useState<Set<string>>(new Set());
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const carica = useCallback(async () => {
    const { ok, dati } = await apiFetch<{
      collegati: Voce[];
      disponibili: Voce[];
      modificabile: boolean;
    }>(`/api/fatture/${fatturaId}/ddt`);
    if (!ok) return;
    setCollegati(dati.collegati ?? []);
    setDisponibili(dati.disponibili ?? []);
    setModificabile(dati.modificabile);
    setScelti(new Set((dati.collegati ?? []).map((d) => d.id)));
  }, [fatturaId]);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function salva() {
    if (inCorso) return;
    setInCorso(true);
    setErrore(null);
    try {
      const { ok, dati } = await apiFetch<{ error?: string }>(
        `/api/fatture/${fatturaId}/ddt`,
        { method: "PUT", body: JSON.stringify({ ddtIds: [...scelti] }) },
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

  // Свързаните и свободните заедно: свързаният DDT не се появява в „свободни",
  // а трябва да може да се махне.
  const tutti = [
    ...collegati,
    ...disponibili.filter((d) => !collegati.some((c) => c.id === d.id)),
  ];

  if (!modificabile && collegati.length === 0) return null;

  return (
    <section className="card p-5" aria-label="DDT di riferimento">
      <h2 className="mb-1 text-lg font-semibold text-text-1">
        DDT di riferimento
      </h2>
      <p className="mb-3 text-xs text-text-3">
        Collegando dei DDT la fattura diventa <strong>differita</strong>: il
        documento viene emesso come TD24 e i riferimenti entrano nell&apos;XML
        (art. 21, comma 4, lett. a, D.P.R. 633/1972).
      </p>

      {tutti.length === 0 ? (
        <p className="text-sm text-text-3">Nessun DDT disponibile.</p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {tutti.map((d) => (
            <li key={d.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-surface-2">
                <input
                  type="checkbox"
                  checked={scelti.has(d.id)}
                  disabled={!modificabile || inCorso}
                  onChange={(e) => {
                    const s = new Set(scelti);
                    if (e.target.checked) s.add(d.id);
                    else s.delete(d.id);
                    setScelti(s);
                  }}
                />
                <span className="font-mono text-xs">{d.numero}</span>
                <span className="text-xs text-text-3">
                  {dataIt(d.data)}
                  {d.destinatario ? ` · ${d.destinatario}` : ""}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {modificabile ? (
        <div className="mt-3 flex items-center gap-3">
          <button
            className="btn-primary h-8 px-3 text-xs"
            onClick={() => void salva()}
            disabled={inCorso}
          >
            Salva riferimenti
          </button>
          <span className="text-xs text-text-3">
            {scelti.size === 0
              ? "Nessun DDT: fattura immediata (TD01)"
              : `${scelti.size} DDT · fattura differita (TD24)`}
          </span>
        </div>
      ) : (
        <p className="mt-3 inline-flex items-center gap-1 text-xs text-text-3">
          <IcoIntegro />
          Fattura non più in bozza: i riferimenti sono definitivi.
        </p>
      )}

      {errore && (
        <p className="mt-2 text-xs text-danger-text" role="alert">
          {errore}
        </p>
      )}
    </section>
  );
}
