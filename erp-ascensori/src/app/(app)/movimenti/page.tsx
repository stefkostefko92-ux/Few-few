"use client";

// Движения на склада — хронологичен регистър + форма за ново движение.

import { useCallback, useEffect, useState } from "react";
import { Modale, Paginazione, Vuoto } from "@/components/ui";
import { dataOraIt } from "@/lib/format";

interface Movimento {
  id: string;
  tipo: "ENTRATA" | "USCITA" | "RETTIFICA";
  quantita: number;
  nota: string | null;
  createdAt: string;
  articolo: { codice: string; nome: string };
}

interface Articolo {
  id: string;
  codice: string;
  nome: string;
  quantita: number;
}

const STILE_TIPO: Record<string, string> = {
  ENTRATA: "bg-success-subtle text-success-text",
  USCITA: "bg-danger-subtle text-danger-text",
  RETTIFICA: "bg-warning-subtle text-warning-text",
};

export default function Pagina() {
  const [righe, setRighe] = useState<Movimento[]>([]);
  const [totale, setTotale] = useState(0);
  const [page, setPage] = useState(1);
  const [aperto, setAperto] = useState(false);
  const [articoli, setArticoli] = useState<Articolo[]>([]);
  const [form, setForm] = useState({ articoloId: "", tipo: "ENTRATA", quantita: "", nota: "" });
  const [errore, setErrore] = useState<string | null>(null);
  const size = 50;

  const carica = useCallback(async () => {
    const res = await fetch(`/api/movimenti?page=${page}&size=${size}`);
    if (!res.ok) return;
    const d = await res.json();
    setRighe(d.righe);
    setTotale(d.totale);
  }, [page]);

  useEffect(() => {
    void carica();
    void fetch("/api/articoli?size=200")
      .then((r) => r.json())
      .then((d) => setArticoli(d.righe ?? []));
  }, [carica]);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    const res = await fetch("/api/movimenti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        articoloId: form.articoloId,
        tipo: form.tipo,
        quantita: Number(form.quantita),
        nota: form.nota || null,
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      setErrore(d.error ?? "Errore");
      return;
    }
    setAperto(false);
    setForm({ articoloId: "", tipo: "ENTRATA", quantita: "", nota: "" });
    void carica();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-1">
            Movimenti di magazzino
          </h1>
          <p className="mt-1 text-sm text-text-3">
            La giacenza non si modifica mai a mano: si registra un movimento
          </p>
        </div>
        <button className="btn-primary" onClick={() => setAperto(true)}>
          + Nuovo movimento
        </button>
      </div>

      <div className="card overflow-hidden">
        {righe.length === 0 ? (
          <Vuoto messaggio="Nessun movimento registrato" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-xs font-medium uppercase tracking-wide text-text-3">
                <th className="px-3 py-2.5">Data</th>
                <th className="px-3 py-2.5">Articolo</th>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5 text-right">Quantità</th>
                <th className="px-3 py-2.5">Causale</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-3 py-2.5 text-text-2">{dataOraIt(m.createdAt)}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono">{m.articolo.codice}</span> · {m.articolo.nome}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex rounded-sm px-2 py-0.5 text-xs font-medium ${STILE_TIPO[m.tipo]}`}
                    >
                      {m.tipo}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {m.tipo === "USCITA" ? "−" : m.tipo === "ENTRATA" ? "+" : "±"}
                    {m.quantita}
                  </td>
                  <td className="px-3 py-2.5 text-text-2">{m.nota ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Paginazione page={page} size={size} totale={totale} onPagina={setPage} />
      </div>

      <Modale titolo="Nuovo movimento" aperto={aperto} onChiudi={() => setAperto(false)}>
        <form onSubmit={salva}>
          <label className="label">Articolo *</label>
          <select
            className="input mb-4"
            required
            value={form.articoloId}
            onChange={(e) => setForm({ ...form, articoloId: e.target.value })}
          >
            <option value="">—</option>
            {articoli.map((a) => (
              <option key={a.id} value={a.id}>
                {a.codice} — {a.nome} (giacenza {a.quantita})
              </option>
            ))}
          </select>
          <label className="label">Tipo *</label>
          <select
            className="input mb-4"
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value })}
          >
            <option value="ENTRATA">Entrata</option>
            <option value="USCITA">Uscita</option>
            <option value="RETTIFICA">Rettifica (± correzione)</option>
          </select>
          <label className="label">Quantità *</label>
          <input
            type="number"
            className="input mb-4 font-mono"
            required
            value={form.quantita}
            onChange={(e) => setForm({ ...form, quantita: e.target.value })}
          />
          <label className="label">Causale / riferimento</label>
          <input
            className="input mb-4"
            value={form.nota}
            onChange={(e) => setForm({ ...form, nota: e.target.value })}
          />
          {errore && (
            <p role="alert" className="mb-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
              {errore}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setAperto(false)}>
              Annulla
            </button>
            <button type="submit" className="btn-primary">
              Registra
            </button>
          </div>
        </form>
      </Modale>
    </div>
  );
}
