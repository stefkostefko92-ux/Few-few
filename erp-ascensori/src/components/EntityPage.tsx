"use client";

// Generic страница за анагрифика: таблица + търсене + странициране + модална
// форма за създаване/промяна + изтриване. Конфигурира се декларативно.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Modale, Paginazione, Vuoto, FiltriStato } from "@/components/ui";
import { perInputData } from "@/lib/format";

export type Riga = Record<string, unknown>;

export interface Colonna {
  chiave: string;
  label: string;
  render?: (r: Riga) => ReactNode;
  className?: string;
}

export interface Opzione {
  value: string;
  label: string;
}

export interface Campo {
  name: string;
  label: string;
  tipo:
    | "text"
    | "email"
    | "number"
    | "decimal"
    | "date"
    | "select"
    | "textarea"
    | "checkbox"
    | "tags";
  opzioni?: Opzione[];
  /** зарежда опции от API: списъчен endpoint + функция за етикет */
  opzioniApi?: { url: string; etichetta: (r: Riga) => string };
  richiesto?: boolean;
  /** стойност по подразбиране при създаване */
  predefinito?: unknown;
  colSpan2?: boolean;
}

export interface EntityConfig {
  titolo: string;
  descrizione?: string;
  api: string;
  colonne: Colonna[];
  campi: Campo[];
  /** cerca placeholder */
  cerca?: string;
  /** позволено изтриване (сървърът пак проверява) */
  eliminabile?: boolean;
  /** линк към детайл при клик на редицата */
  linkDettaglio?: (r: Riga) => string;
  /** допълнителни бутони в заглавието */
  extraAzioni?: ReactNode;
  /** филтър-хапчета по статус (име на полето + възможните стойности) */
  filtroStato?: { campo: string; valori: readonly string[] };
}

async function apiJson(url: string, init?: RequestInit): Promise<{ ok: boolean; dati: Riga }> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const dati = (await res.json().catch(() => ({}))) as Riga;
  return { ok: res.ok, dati };
}

export function valoreAnnidato(r: Riga, chiave: string): unknown {
  return chiave.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object") return (acc as Riga)[k];
    return undefined;
  }, r);
}

export default function EntityPage({ config }: { config: EntityConfig }) {
  const [righe, setRighe] = useState<Riga[]>([]);
  const [totale, setTotale] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [stato, setStato] = useState("");
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [modale, setModale] = useState<{ modo: "crea" | "modifica"; riga?: Riga } | null>(null);
  const size = 50;

  const carica = useCallback(async () => {
    setCaricamento(true);
    const filtro = stato && config.filtroStato ? `&${config.filtroStato.campo}=${stato}` : "";
    const url = `${config.api}?page=${page}&size=${size}${q ? `&q=${encodeURIComponent(q)}` : ""}${filtro}`;
    const { ok, dati } = await apiJson(url);
    if (ok) {
      setRighe((dati.righe as Riga[]) ?? []);
      setTotale((dati.totale as number) ?? 0);
      setErrore(null);
    } else {
      setErrore((dati.error as string) ?? "Errore di caricamento");
    }
    setCaricamento(false);
  }, [config.api, page, q, stato, config.filtroStato]);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function elimina(r: Riga) {
    if (!confirm("Eliminare definitivamente questo record?")) return;
    const { ok, dati } = await apiJson(`${config.api}/${r.id}`, { method: "DELETE" });
    if (!ok) {
      alert((dati.error as string) ?? "Errore");
      return;
    }
    void carica();
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-1">{config.titolo}</h1>
          {config.descrizione && <p className="mt-1 text-sm text-text-3">{config.descrizione}</p>}
        </div>
        <div className="flex items-center gap-2">
          {config.extraAzioni}
          <button className="btn-primary" onClick={() => setModale({ modo: "crea" })}>
            + Nuovo
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="input w-64"
              placeholder={config.cerca ?? "Cerca…"}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            {config.filtroStato && (
              <FiltriStato
                valori={config.filtroStato.valori}
                attivo={stato}
                onCambia={(v) => {
                  setStato(v);
                  setPage(1);
                }}
              />
            )}
          </div>
          {!caricamento && !errore && (
            <span className="text-xs text-text-3">
              {totale} {totale === 1 ? "risultato" : "risultati"}
            </span>
          )}
        </div>

        {errore ? (
          <Vuoto messaggio={errore} />
        ) : caricamento ? (
          <Vuoto messaggio="Caricamento…" />
        ) : righe.length === 0 ? (
          <Vuoto
            messaggio={q || stato ? "Nessun risultato per i filtri attivi" : "Nessun record ancora"}
            azione={q || stato ? "Azzera i filtri" : `+ Crea il primo`}
            onAzione={() => {
              if (q || stato) {
                setQ("");
                setStato("");
                setPage(1);
              } else setModale({ modo: "crea" });
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-strong bg-surface-2 text-left text-xs font-medium uppercase tracking-wide text-text-3">
                  {config.colonne.map((c) => (
                    <th key={c.chiave} className={`px-3 py-2.5 ${c.className ?? ""}`}>
                      {c.label}
                    </th>
                  ))}
                  <th className="w-24 px-3 py-2.5 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => (
                  <tr
                    key={String(r.id)}
                    className={`border-b border-border last:border-0 hover:bg-surface-2 ${config.linkDettaglio ? "cursor-pointer" : ""}`}
                    onClick={() => {
                      if (config.linkDettaglio) window.location.href = config.linkDettaglio(r);
                    }}
                  >
                    {config.colonne.map((c) => (
                      <td key={c.chiave} className={`px-3 py-2.5 ${c.className ?? ""}`}>
                        {c.render ? c.render(r) : String(valoreAnnidato(r, c.chiave) ?? "—")}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-ghost h-7 px-2 text-xs"
                        onClick={() => setModale({ modo: "modifica", riga: r })}
                      >
                        Modifica
                      </button>
                      {config.eliminabile !== false && (
                        <button
                          className="btn-ghost h-7 px-2 text-xs text-danger-text"
                          onClick={() => void elimina(r)}
                        >
                          Elimina
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Paginazione page={page} size={size} totale={totale} onPagina={setPage} />
      </div>

      {modale && (
        <FormEntity
          config={config}
          modo={modale.modo}
          riga={modale.riga}
          onChiudi={() => setModale(null)}
          onSalvato={() => {
            setModale(null);
            void carica();
          }}
        />
      )}
    </div>
  );
}

// ── Формата (create/edit) ───────────────────────────────────────────────────

function valoreIniziale(campo: Campo, riga?: Riga): unknown {
  if (!riga) return campo.predefinito ?? (campo.tipo === "checkbox" ? true : "");
  const v = riga[campo.name];
  if (v === null || v === undefined) return campo.tipo === "checkbox" ? false : "";
  if (campo.tipo === "date") return perInputData(v as string | Date);
  if (campo.tipo === "tags") return (v as string[]).join(", ");
  return v;
}

export function FormEntity({
  config,
  modo,
  riga,
  onChiudi,
  onSalvato,
}: {
  config: EntityConfig;
  modo: "crea" | "modifica";
  riga?: Riga;
  onChiudi: () => void;
  onSalvato: () => void;
}) {
  const [valori, setValori] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(config.campi.map((c) => [c.name, valoreIniziale(c, riga)]))
  );
  const [errore, setErrore] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);
  const [opzioniFk, setOpzioniFk] = useState<Record<string, Opzione[]>>({});

  const campiFk = useMemo(
    () => config.campi.filter((c) => c.opzioniApi),
    [config.campi]
  );

  useEffect(() => {
    for (const campo of campiFk) {
      const { url, etichetta } = campo.opzioniApi!;
      void apiJson(`${url}${url.includes("?") ? "&" : "?"}size=200`).then(({ ok, dati }) => {
        if (!ok) return;
        const lista = ((dati.righe as Riga[]) ?? []).map((r) => ({
          value: String(r.id),
          label: etichetta(r),
        }));
        setOpzioniFk((prev) => ({ ...prev, [campo.name]: lista }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setSalvataggio(true);
    setErrore(null);

    const corpo: Record<string, unknown> = {};
    for (const campo of config.campi) {
      let v = valori[campo.name];
      if (campo.tipo === "number") v = v === "" || v === null ? null : Number(v);
      if (campo.tipo === "decimal" || campo.tipo === "text" || campo.tipo === "email")
        v = typeof v === "string" && v.trim() === "" ? null : v;
      if (campo.tipo === "textarea") v = typeof v === "string" && v.trim() === "" ? null : v;
      if (campo.tipo === "date") v = v === "" ? null : v;
      if (campo.tipo === "select") v = v === "" ? null : v;
      if (campo.tipo === "tags")
        v = typeof v === "string"
          ? v.split(",").map((x) => x.trim()).filter(Boolean)
          : [];
      // при create не пращаме null за незадължителни празни полета
      if (modo === "crea" && v === null && !campo.richiesto) continue;
      corpo[campo.name] = v;
    }

    const url = modo === "crea" ? config.api : `${config.api}/${riga!.id}`;
    const { ok, dati } = await apiJson(url, {
      method: modo === "crea" ? "POST" : "PUT",
      body: JSON.stringify(corpo),
    });
    setSalvataggio(false);
    if (!ok) {
      setErrore((dati.error as string) ?? "Errore di salvataggio");
      return;
    }
    onSalvato();
  }

  return (
    <Modale
      titolo={modo === "crea" ? `Nuovo — ${config.titolo}` : `Modifica — ${config.titolo}`}
      aperto
      onChiudi={onChiudi}
      largo={config.campi.length > 6}
    >
      <form onSubmit={salva}>
        <div className={`grid gap-4 ${config.campi.length > 6 ? "sm:grid-cols-2" : ""}`}>
          {config.campi.map((campo) => (
            <div key={campo.name} className={campo.colSpan2 ? "sm:col-span-2" : ""}>
              <label className="label" htmlFor={`f-${campo.name}`}>
                {campo.label}
                {campo.richiesto && <span className="text-danger"> *</span>}
              </label>
              <CampoInput
                campo={campo}
                valore={valori[campo.name]}
                opzioniFk={opzioniFk[campo.name]}
                onCambia={(v) => setValori((prev) => ({ ...prev, [campo.name]: v }))}
              />
            </div>
          ))}
        </div>
        {errore && (
          <p role="alert" className="mt-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            {errore}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onChiudi}>
            Annulla
          </button>
          <button type="submit" className="btn-primary" disabled={salvataggio}>
            {salvataggio ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      </form>
    </Modale>
  );
}

function CampoInput({
  campo,
  valore,
  opzioniFk,
  onCambia,
}: {
  campo: Campo;
  valore: unknown;
  opzioniFk?: Opzione[];
  onCambia: (v: unknown) => void;
}) {
  const id = `f-${campo.name}`;
  const opzioni = campo.opzioni ?? opzioniFk ?? [];

  switch (campo.tipo) {
    case "select":
      return (
        <select
          id={id}
          className="input"
          value={String(valore ?? "")}
          onChange={(e) => onCambia(e.target.value)}
          required={campo.richiesto}
        >
          <option value="">—</option>
          {opzioni.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "textarea":
      return (
        <textarea
          id={id}
          className="input min-h-20 py-2"
          value={String(valore ?? "")}
          onChange={(e) => onCambia(e.target.value)}
          required={campo.richiesto}
        />
      );
    case "checkbox":
      return (
        <input
          id={id}
          type="checkbox"
          className="h-5 w-5 accent-[var(--accent)]"
          checked={Boolean(valore)}
          onChange={(e) => onCambia(e.target.checked)}
        />
      );
    case "number":
      return (
        <input
          id={id}
          type="number"
          className="input"
          value={valore === null || valore === undefined ? "" : String(valore)}
          onChange={(e) => onCambia(e.target.value)}
          required={campo.richiesto}
        />
      );
    case "decimal":
      return (
        <input
          id={id}
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          className="input font-mono"
          value={String(valore ?? "")}
          onChange={(e) => onCambia(e.target.value)}
          required={campo.richiesto}
        />
      );
    case "date":
      return (
        <input
          id={id}
          type="date"
          className="input"
          value={String(valore ?? "")}
          onChange={(e) => onCambia(e.target.value)}
          required={campo.richiesto}
        />
      );
    default:
      return (
        <input
          id={id}
          type={campo.tipo === "email" ? "email" : "text"}
          className="input"
          value={String(valore ?? "")}
          onChange={(e) => onCambia(e.target.value)}
          required={campo.richiesto}
        />
      );
  }
}
