"use client";

// Редактор на редове (voci/righe) за preventivo, fattura и DDT.
// Тоталите се преизчисляват от сървъра — тук само се показват.

import { useState } from "react";
import { euro } from "@/lib/format";
import { IcoNuovoPiccolo } from "@/components/icone";
import { apiFetch } from "@/lib/fetch-client";

export interface VoceRiga {
  id: string;
  descrizione: string;
  quantita: string;
  prezzoUnitario?: string;
  aliquotaIva?: string;
  totale?: string;
  um?: string | null;
  peso?: string | null;
  ordine: number;
}

export default function VociEditor({
  api,
  voci,
  conPrezzi,
  onCambiato,
}: {
  /** базов път: /api/preventivi/<id>/voci */
  api: string;
  voci: VoceRiga[];
  /** true за preventivo/fattura (цени+IVA); false за DDT (um/peso) */
  conPrezzi: boolean;
  onCambiato: () => void;
}) {
  const vuoto: Record<string, string> = conPrezzi
    ? { descrizione: "", quantita: "1", prezzoUnitario: "", aliquotaIva: "22" }
    : { descrizione: "", quantita: "1", um: "pz", peso: "" };
  const [form, setForm] = useState<Record<string, string>>(vuoto);
  const [inModifica, setInModifica] = useState<string | null>(null);
  /** Без този пазач двойното щракване по бавна връзка вписва реда ДВА пъти —
   *  и тоталът на фактурата излиза с една позиция повече, без нищо да го спре. */
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  function corpo(): Record<string, unknown> {
    const b: Record<string, unknown> = {
      descrizione: form.descrizione,
      quantita: form.quantita,
      ordine: inModifica ? undefined : voci.length,
    };
    if (conPrezzi) {
      b.prezzoUnitario = form.prezzoUnitario || "0";
      b.aliquotaIva = form.aliquotaIva || "22";
    } else {
      b.um = form.um || null;
      b.peso = form.peso || null;
    }
    return b;
  }

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    if (inCorso) return;
    setInCorso(true);
    setErrore(null);
    const url = inModifica ? `${api}/${inModifica}` : api;
    try {
      const { ok, dati } = await apiFetch<{ error?: string }>(url, {
        method: inModifica ? "PUT" : "POST",
        body: JSON.stringify(corpo()),
      });
      if (!ok) {
        setErrore(dati.error ?? "Errore di salvataggio");
        return;
      }
      setForm(vuoto);
      setInModifica(null);
      onCambiato();
    } finally {
      setInCorso(false);
    }
  }

  async function elimina(id: string) {
    if (!confirm("Eliminare definitivamente questa riga?")) return;
    if (inCorso) return;
    setInCorso(true);
    try {
      const { ok, dati } = await apiFetch<{ error?: string }>(`${api}/${id}`, {
        method: "DELETE",
      });
      if (ok) onCambiato();
      else setErrore(dati.error ?? "Errore di eliminazione");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div>
      {/* Без този ред празният документ показва само гола форма и потребителят
          не разбира дали редовете липсват, или още не са се заредили. */}
      {voci.length === 0 && (
        <p className="mb-4 rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-text-3">
          Nessuna riga presente: compilare il modulo qui sotto per aggiungere la prima.
        </p>
      )}
      {voci.length > 0 && (
        <table className="mb-4 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-text-3">
              <th className="py-2 pr-3">Descrizione</th>
              <th className="py-2 pr-3 text-right">Qtà</th>
              {conPrezzi ? (
                <>
                  <th className="py-2 pr-3 text-right">Prezzo</th>
                  <th className="py-2 pr-3 text-right">IVA %</th>
                  <th className="py-2 pr-3 text-right">Totale</th>
                </>
              ) : (
                <>
                  <th className="py-2 pr-3">UM</th>
                  <th className="py-2 pr-3 text-right">Peso (kg)</th>
                </>
              )}
              <th className="w-24 py-2 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {voci.map((v) => (
              <tr key={v.id} className="border-b border-border last:border-0">
                <td className="py-2 pr-3">{v.descrizione}</td>
                <td className="py-2 pr-3 text-right font-mono">{v.quantita}</td>
                {conPrezzi ? (
                  <>
                    <td className="py-2 pr-3 text-right font-mono">{euro(v.prezzoUnitario)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{v.aliquotaIva}</td>
                    <td className="py-2 pr-3 text-right font-mono font-medium">
                      {euro(v.totale)}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-2 pr-3">{v.um ?? "—"}</td>
                    <td className="py-2 pr-3 text-right font-mono">{v.peso ?? "—"}</td>
                  </>
                )}
                <td className="py-2 text-right">
                  <button
                    className="btn-ghost h-7 px-2 text-xs"
                    onClick={() => {
                      setInModifica(v.id);
                      setForm({
                        descrizione: v.descrizione,
                        quantita: v.quantita,
                        prezzoUnitario: v.prezzoUnitario ?? "",
                        aliquotaIva: v.aliquotaIva ?? "22",
                        um: v.um ?? "",
                        peso: v.peso ?? "",
                      });
                    }}
                  >
                    Modifica
                  </button>
                  <button
                    className="btn-ghost h-7 px-2 text-xs text-danger-text"
                    onClick={() => void elimina(v.id)}
                  >
                    Elimina
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={salva} className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <label className="label">Descrizione</label>
          <input
            className="input"
            required
            value={form.descrizione}
            onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
          />
        </div>
        <div className="w-20">
          <label className="label">Qtà</label>
          <input
            className="input font-mono"
            required
            inputMode="decimal"
            value={form.quantita}
            onChange={(e) => setForm({ ...form, quantita: e.target.value })}
          />
        </div>
        {conPrezzi ? (
          <>
            <div className="w-28">
              <label className="label">Prezzo (€)</label>
              <input
                className="input font-mono"
                required
                inputMode="decimal"
                value={form.prezzoUnitario}
                onChange={(e) => setForm({ ...form, prezzoUnitario: e.target.value })}
              />
            </div>
            <div className="w-20">
              <label className="label">IVA %</label>
              <input
                className="input font-mono"
                inputMode="decimal"
                value={form.aliquotaIva}
                onChange={(e) => setForm({ ...form, aliquotaIva: e.target.value })}
              />
            </div>
          </>
        ) : (
          <>
            <div className="w-20">
              <label className="label">UM</label>
              <input
                className="input"
                value={form.um}
                onChange={(e) => setForm({ ...form, um: e.target.value })}
              />
            </div>
            <div className="w-28">
              <label className="label">Peso (kg)</label>
              <input
                className="input font-mono"
                inputMode="decimal"
                value={form.peso}
                onChange={(e) => setForm({ ...form, peso: e.target.value })}
              />
            </div>
          </>
        )}
        <button
          type="submit"
          className="btn-primary inline-flex items-center gap-1.5"
          disabled={inCorso}
        >
          {!inModifica && <IcoNuovoPiccolo />}
          {inCorso ? "Salvataggio…" : inModifica ? "Aggiorna riga" : "Aggiungi riga"}
        </button>
        {inModifica && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setInModifica(null);
              setForm(vuoto);
            }}
          >
            Annulla
          </button>
        )}
      </form>
      {errore && (
        <p role="alert" className="mt-3 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          {errore}
        </p>
      )}
    </div>
  );
}
