"use client";

// Generic страница за анагрифика: таблица + търсене + странициране + модална
// форма за създаване/промяна + изтриване. Конфигурира се декларативно.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Modale,
  Paginazione,
  Vuoto,
  FiltriStato,
  ScheletroTabella,
} from "@/components/ui";
import Link from "next/link";
import { IcoNuovo } from "@/components/icone";
import { perInputData } from "@/lib/format";
import { apiFetch } from "@/lib/fetch-client";

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
    | "tags"
    | "multiselect";
  opzioni?: Opzione[];
  /** зарежда опции от API: списъчен endpoint + функция за етикет */
  opzioniApi?: { url: string; etichetta: (r: Riga) => string };
  /** при `multiselect`: кой ключ на вложения ред носи id-то (напр. „impiantoId") */
  chiaveMulti?: string;
  /** име на полето В ТЯЛОТО на заявката, ако се различава от `name`.
   *  Нужно е, когато формата ЧЕТЕ от връзка (`impianti`), а API-то ПРИЕМА
   *  списък с идентификатори (`impiantiIds`). */
  inviaCome?: string;
  richiesto?: boolean;
  /** стойност по подразбиране при създаване */
  predefinito?: unknown;
  colSpan2?: boolean;
  /**
   * Кратко обяснение под полето, на италиански.
   *
   * Нужно е там, където етикетът не стига: фискалните полета (получател,
   * разцепено плащане, CIG) носят правни последици, а операторът не бива да
   * научава за тях от отказ на SDI седмица по-късно. Свързано е с полето през
   * `aria-describedby`, не е просто сив текст.
   */
  aiuto?: string;
}

export interface EntityConfig {
  titolo: string;
  /** Единствено число на същността, за заглавия и празни състояния.
   *  Италианският иска съгласуване: шаблонът „Nuovo — ${titolo}" дава
   *  „Nuovo — Fatture", което не е италиански. */
  singolare?: string;
  /** Родът на `singolare` — определя „Nuovo/Nuova" и „il primo/la prima". */
  genere?: "m" | "f";
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

// Подновяването на сесията и мрежовите грешки живеят в `apiFetch` — тук само
// стесняваме типа до редицата, с която работи страницата.
async function apiJson(
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; dati: Riga }> {
  const { ok, dati } = await apiFetch<Riga>(url, init);
  return { ok, dati };
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
  const [modale, setModale] = useState<{
    modo: "crea" | "modifica";
    riga?: Riga;
  } | null>(null);
  const size = 50;

  const carica = useCallback(async () => {
    setCaricamento(true);
    const filtro =
      stato && config.filtroStato
        ? `&${config.filtroStato.campo}=${stato}`
        : "";
    const url = `${config.api}?page=${page}&size=${size}${q ? `&q=${encodeURIComponent(q)}` : ""}${filtro}`;
    try {
      const { ok, dati } = await apiJson(url);
      if (ok) {
        setRighe((dati.righe as Riga[]) ?? []);
        setTotale((dati.totale as number) ?? 0);
        setErrore(null);
      } else {
        setErrore((dati.error as string) ?? "Errore di caricamento");
      }
    } finally {
      // Задължително в `finally`: при хвърляне таблицата оставаше на скелета,
      // без начин потребителят да разбере какво е станало.
      setCaricamento(false);
    }
  }, [config.api, page, q, stato, config.filtroStato]);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function elimina(r: Riga) {
    if (!confirm("Eliminare definitivamente questa scheda?")) return;
    const { ok, dati } = await apiJson(`${config.api}/${r.id}`, {
      method: "DELETE",
    });
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
          <h1 className="text-2xl font-semibold tracking-tight text-text-1">
            {config.titolo}
          </h1>
          {config.descrizione && (
            <p className="mt-1 text-sm text-text-3">{config.descrizione}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {config.extraAzioni}
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            onClick={() => setModale({ modo: "crea" })}
          >
            <IcoNuovo />
            {config.genere === "f" ? "Nuova" : "Nuovo"} {config.singolare ?? ""}
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
          <Vuoto messaggio={errore} icona={false} />
        ) : caricamento ? (
          <ScheletroTabella colonne={config.colonne.length + 1} />
        ) : righe.length === 0 ? (
          <Vuoto
            messaggio={
              q || stato
                ? "Nessun risultato per i filtri attivi"
                : "Nessun elemento presente"
            }
            azione={
              q || stato
                ? "Azzera i filtri"
                : `Crea ${config.genere === "f" ? "la prima" : "il primo"} ${config.singolare ?? ""}`.trim()
            }
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
                    <th
                      key={c.chiave}
                      className={`px-3 py-2.5 ${c.className ?? ""}`}
                    >
                      {c.label}
                    </th>
                  ))}
                  <th className="w-32 px-3 py-2.5 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => (
                  <tr
                    key={String(r.id)}
                    className={`border-b border-border last:border-0 hover:bg-surface-2 ${config.linkDettaglio ? "cursor-pointer" : ""}`}
                    onClick={() => {
                      if (config.linkDettaglio)
                        window.location.href = config.linkDettaglio(r);
                    }}
                  >
                    {config.colonne.map((c, i) => {
                      const contenuto = c.render
                        ? c.render(r)
                        : String(valoreAnnidato(r, c.chiave) ?? "—");
                      return (
                        <td
                          key={c.chiave}
                          className={`px-3 py-2.5 ${c.className ?? ""}`}
                        >
                          {/* ПЪРВАТА клетка е истинска връзка, когато редът води
                              към детайл. Кликът върху целия ред остава удобство,
                              но той е `onClick` върху `<tr>` — с мишка работи, с
                              клавиатура не съществува (WCAG 2.1.1, а EAA е закон
                              в ЕС). Връзката дава фокус, Enter, среден бутон и
                              „отвори в нов раздел". */}
                          {i === 0 && config.linkDettaglio ? (
                            <Link
                              href={config.linkDettaglio(r)}
                              className="rounded-sm outline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {contenuto}
                            </Link>
                          ) : (
                            contenuto
                          )}
                        </td>
                      );
                    })}
                    {/* „Elimina" е разрушително и стои до „Modifica": целта за
                        докосване е 32 px и има отстояние, за да не се уцелва грешно. */}
                    <td
                      className="px-3 py-2.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          className="btn-ghost h-8 px-2.5 text-xs"
                          onClick={() =>
                            setModale({ modo: "modifica", riga: r })
                          }
                        >
                          Modifica
                        </button>
                        {config.eliminabile !== false && (
                          <button
                            className="btn-ghost h-8 px-2.5 text-xs text-danger-text"
                            onClick={() => void elimina(r)}
                          >
                            Elimina
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Paginazione
          page={page}
          size={size}
          totale={totale}
          onPagina={setPage}
        />
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
  if (!riga)
    return campo.predefinito ?? (campo.tipo === "checkbox" ? true : "");
  const v = riga[campo.name];
  if (v === null || v === undefined)
    return campo.tipo === "checkbox" ? false : "";
  if (campo.tipo === "date") return perInputData(v as string | Date);
  if (campo.tipo === "tags") return (v as string[]).join(", ");
  // Многото стойности идват като списък от свързващи редове — вадим само id-тата.
  if (campo.tipo === "multiselect")
    return Array.isArray(v)
      ? (v as Riga[]).map((x) => String(x[campo.chiaveMulti ?? "id"] ?? x))
      : [];
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
    Object.fromEntries(
      config.campi.map((c) => [c.name, valoreIniziale(c, riga)]),
    ),
  );
  const [errore, setErrore] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);
  const [opzioniFk, setOpzioniFk] = useState<Record<string, Opzione[]>>({});

  const campiFk = useMemo(
    () => config.campi.filter((c) => c.opzioniApi),
    [config.campi],
  );

  useEffect(() => {
    for (const campo of campiFk) {
      const { url, etichetta } = campo.opzioniApi!;
      void apiJson(`${url}${url.includes("?") ? "&" : "?"}size=200`).then(
        ({ ok, dati }) => {
          if (!ok) return;
          const lista = ((dati.righe as Riga[]) ?? []).map((r) => ({
            value: String(r.id),
            label: etichetta(r),
          }));
          setOpzioniFk((prev) => ({ ...prev, [campo.name]: lista }));
        },
      );
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
      if (campo.tipo === "number")
        v = v === "" || v === null ? null : Number(v);
      if (
        campo.tipo === "decimal" ||
        campo.tipo === "text" ||
        campo.tipo === "email"
      )
        v = typeof v === "string" && v.trim() === "" ? null : v;
      if (campo.tipo === "textarea")
        v = typeof v === "string" && v.trim() === "" ? null : v;
      if (campo.tipo === "date") v = v === "" ? null : v;
      if (campo.tipo === "select") v = v === "" ? null : v;
      if (campo.tipo === "multiselect") v = Array.isArray(v) ? v : [];
      if (campo.tipo === "tags")
        v =
          typeof v === "string"
            ? v
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean)
            : [];
      // при create не пращаме null за незадължителни празни полета
      if (modo === "crea" && v === null && !campo.richiesto) continue;
      corpo[campo.inviaCome ?? campo.name] = v;
    }

    const url = modo === "crea" ? config.api : `${config.api}/${riga!.id}`;
    try {
      const { ok, dati } = await apiJson(url, {
        method: modo === "crea" ? "POST" : "PUT",
        body: JSON.stringify(corpo),
      });
      if (!ok) {
        setErrore((dati.error as string) ?? "Errore di salvataggio");
        return;
      }
      onSalvato();
    } finally {
      // При хвърляне формата оставаше на „Salvataggio…" и въведеното беше
      // недостъпно — най-лошият момент да заключиш потребителя.
      setSalvataggio(false);
    }
  }

  return (
    <Modale
      titolo={
        modo === "crea"
          ? `${config.genere === "f" ? "Nuova" : "Nuovo"} ${config.singolare ?? config.titolo.toLowerCase()}`
          : `Modifica ${config.singolare ?? config.titolo.toLowerCase()}`
      }
      aperto
      onChiudi={onChiudi}
      largo={config.campi.length > 6}
    >
      <form onSubmit={salva}>
        <div
          className={`grid gap-4 ${config.campi.length > 6 ? "sm:grid-cols-2" : ""}`}
        >
          {config.campi.map((campo) => (
            <div
              key={campo.name}
              className={campo.colSpan2 ? "sm:col-span-2" : ""}
            >
              <label className="label" htmlFor={`f-${campo.name}`}>
                {campo.label}
                {campo.richiesto && <span className="text-danger"> *</span>}
              </label>
              <CampoInput
                campo={campo}
                valore={valori[campo.name]}
                opzioniFk={opzioniFk[campo.name]}
                onCambia={(v) =>
                  setValori((prev) => ({ ...prev, [campo.name]: v }))
                }
              />
              {campo.aiuto && (
                <p id={`a-${campo.name}`} className="mt-1 text-xs text-text-3">
                  {campo.aiuto}
                </p>
              )}
            </div>
          ))}
        </div>
        {errore && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text"
          >
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
  // Обяснението под полето трябва да е СВЪРЗАНО с контрола, не просто да стои
  // до него: екранният четец го изчита само през `aria-describedby`.
  const descritto = campo.aiuto
    ? { "aria-describedby": `a-${campo.name}` }
    : {};

  switch (campo.tipo) {
    case "select":
      return (
        <select
          id={id}
          {...descritto}
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
    case "multiselect": {
      // Списък с отметки, не `<select multiple>`: последният е неоткриваем на
      // тъч и изисква Ctrl, за да добавиш втори елемент.
      const scelti = new Set(Array.isArray(valore) ? (valore as string[]) : []);
      return (
        <div
          id={id}
          {...descritto}
          role="group"
          aria-label={campo.label}
          className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border bg-bg p-2"
        >
          {opzioni.length === 0 && (
            <p className="px-1 py-2 text-sm text-text-3">Nessuna opzione</p>
          )}
          {opzioni.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 px-1 py-1 text-sm"
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={scelti.has(o.value)}
                onChange={(e) => {
                  const next = new Set(scelti);
                  if (e.target.checked) next.add(o.value);
                  else next.delete(o.value);
                  onCambia([...next]);
                }}
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    }
    case "textarea":
      return (
        <textarea
          id={id}
          {...descritto}
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
          {...descritto}
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
          {...descritto}
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
          {...descritto}
          type="text"
          inputMode="decimal"
          placeholder="0,00"
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
          {...descritto}
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
          {...descritto}
          type={campo.tipo === "email" ? "email" : "text"}
          className="input"
          value={String(valore ?? "")}
          onChange={(e) => onCambia(e.target.value)}
          required={campo.richiesto}
        />
      );
  }
}
