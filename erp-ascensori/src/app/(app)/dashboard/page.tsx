"use client";

// Персонализируемо табло: widget-и с избор на източник, тип графика, цветове,
// ширина и подредба. Конфигурацията се пази per-браузър (localStorage) и се
// нулира с „Ripristina". Икономическите данни идват само за DIREZIONE+ (сървър).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  GraficoCategorie,
  GraficoSerie,
  COLORI_GRAFICO,
  type TipoGrafico,
  type PuntoCategoria,
  type PuntoSerie,
} from "@/components/Grafico";
import { Barra } from "@/components/ui";
import { IcoChiudi, IcoGiu, IcoLarghezza, IcoSu } from "@/components/icone";
import { euro, dataIt } from "@/lib/format";

// ── Модел на конфигурацията ─────────────────────────────────────────────────

type TipoWidget = "kpi" | "grafico" | "scadenze" | "scorte";

interface WidgetCfg {
  id: string;
  tipo: TipoWidget;
  titolo?: string;
  fonte?: string;
  grafico?: TipoGrafico;
  colore?: "multi" | number;
  larghezza: 1 | 2;
}

const CHIAVE_LS = "ea:dashboard:v1";

const FONTI: Record<
  string,
  { label: string; serie?: { chiave: string; label: string }[] }
> = {
  ordiniPerStato: { label: "Ordini per stato" },
  ordiniPerPriorita: { label: "Ordini aperti per priorità" },
  preventiviPerStato: { label: "Preventivi per stato" },
  impiantiPerStato: { label: "Impianti per stato" },
  automezziPerStato: { label: "Automezzi per stato delle scadenze" },
  fatturatoMensile: {
    label: "Fatturato mensile (12 mesi)",
    serie: [
      { chiave: "emesso", label: "Emesso" },
      { chiave: "incassato", label: "Incassato" },
    ],
  },
};

const PREDEFINITO: WidgetCfg[] = [
  { id: "w1", tipo: "kpi", larghezza: 2 },
  {
    id: "w2",
    tipo: "grafico",
    fonte: "ordiniPerStato",
    grafico: "bar",
    colore: "multi",
    larghezza: 2,
  },
  {
    id: "w3",
    tipo: "grafico",
    fonte: "fatturatoMensile",
    grafico: "area",
    colore: "multi",
    larghezza: 2,
  },
  {
    id: "w4",
    tipo: "grafico",
    fonte: "preventiviPerStato",
    grafico: "donut",
    colore: "multi",
    larghezza: 1,
  },
  {
    id: "w5",
    tipo: "grafico",
    fonte: "impiantiPerStato",
    grafico: "donut",
    colore: "multi",
    larghezza: 1,
  },
  { id: "w6", tipo: "scadenze", larghezza: 1 },
  { id: "w7", tipo: "scorte", larghezza: 1 },
];

function caricaCfg(): WidgetCfg[] {
  try {
    const s = localStorage.getItem(CHIAVE_LS);
    if (!s) return PREDEFINITO;
    const parsed = JSON.parse(s) as WidgetCfg[];
    if (!Array.isArray(parsed) || parsed.length === 0) return PREDEFINITO;
    return parsed;
  } catch {
    return PREDEFINITO;
  }
}

// ── Данни от сървъра ────────────────────────────────────────────────────────

interface Stats {
  kpi: {
    impiantiTotali: number;
    ordiniAperti: number;
    preventiviInAttesa: number;
    scadenze30gg: number;
    sottoScorta: number;
    dipendentiAttivi: number;
    automezziRosso: number;
  };
  impiantiPerStato: PuntoCategoria[];
  ordiniPerStato: PuntoCategoria[];
  ordiniPerPriorita: PuntoCategoria[];
  preventiviPerStato: PuntoCategoria[];
  automezziPerStato: PuntoCategoria[];
  scadenzeProssime: {
    id: string;
    tipo: string;
    dataScadenza: string;
    impianto: { matricola: string; indirizzo: string | null };
  }[];
  sottoScorta: {
    id: string;
    codice: string;
    nome: string;
    quantita: number;
    sogliaMinima: number;
  }[];
  fatturatoMensile?: PuntoSerie[];
  insoluti?: { numero: number; totale: number };
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [widgets, setWidgets] = useState<WidgetCfg[]>(PREDEFINITO);
  const [modifica, setModifica] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setWidgets(caricaCfg());
    setPronto(true);
    void fetch("/api/dashboard/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStats(d))
      .catch(() => null);
  }, []);

  const salva = useCallback((nuovi: WidgetCfg[]) => {
    setWidgets(nuovi);
    try {
      localStorage.setItem(CHIAVE_LS, JSON.stringify(nuovi));
    } catch {}
  }, []);

  const aggiorna = useCallback(
    (id: string, patch: Partial<WidgetCfg>) =>
      salva(widgets.map((w) => (w.id === id ? { ...w, ...patch } : w))),
    [widgets, salva],
  );

  const sposta = useCallback(
    (id: string, dir: -1 | 1) => {
      const i = widgets.findIndex((w) => w.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= widgets.length) return;
      const nuovi = [...widgets];
      [nuovi[i], nuovi[j]] = [nuovi[j], nuovi[i]];
      salva(nuovi);
    },
    [widgets, salva],
  );

  const rimuovi = useCallback(
    (id: string) => salva(widgets.filter((w) => w.id !== id)),
    [widgets, salva],
  );

  const aggiungi = useCallback(
    (tipo: TipoWidget, fonte?: string) => {
      const id = `w${Date.now()}`;
      salva([
        ...widgets,
        {
          id,
          tipo,
          fonte,
          grafico: "bar",
          colore: "multi",
          larghezza: 1,
        },
      ]);
    },
    [widgets, salva],
  );

  const fontiDisponibili = useMemo(
    () =>
      Object.keys(FONTI).filter(
        (f) =>
          f !== "fatturatoMensile" || stats?.fatturatoMensile !== undefined,
      ),
    [stats],
  );

  if (!pronto) return null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-1">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-text-3">
            Panoramica operativa · grafici completamente personalizzabili
          </p>
        </div>
        {/* Само превключвателят стои в заглавието. Инструментите за редакция бяха
            тук и при влизане в режима бутонът отскачаше наляво — мишката оставаше
            върху друг контрол. Сега заглавието е неподвижно, а режимът се обявява
            с отделна лента отдолу. */}
        <button
          className={modifica ? "btn-primary" : "btn-secondary"}
          onClick={() => setModifica(!modifica)}
        >
          {modifica ? "Fine personalizzazione" : "Personalizza"}
        </button>
      </div>

      {modifica && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent-subtle px-3 py-2.5">
          <span className="mr-1 text-sm font-medium text-accent-text">
            Modalità personalizzazione
          </span>
          <select
            className="input w-56"
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              if (v === "kpi" || v === "scadenze" || v === "scorte")
                aggiungi(v as TipoWidget);
              else aggiungi("grafico", v);
            }}
            aria-label="Aggiungi widget"
          >
            <option value="">+ Aggiungi widget…</option>
            {fontiDisponibili.map((f) => (
              <option key={f} value={f}>
                Grafico: {FONTI[f].label}
              </option>
            ))}
            <option value="kpi">Indicatori (KPI)</option>
            <option value="scadenze">Elenco scadenze imminenti</option>
            <option value="scorte">Articoli sotto scorta</option>
          </select>
          <button className="btn-secondary" onClick={() => salva(PREDEFINITO)}>
            Ripristina predefinito
          </button>
          <span className="ml-auto text-xs text-accent-text">
            Le modifiche si salvano automaticamente su questo browser
          </span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {widgets.map((w, i) => (
          <div key={w.id} className={w.larghezza === 2 ? "lg:col-span-2" : ""}>
            <WidgetCard
              cfg={w}
              stats={stats}
              modifica={modifica}
              primo={i === 0}
              ultimo={i === widgets.length - 1}
              onAggiorna={(patch) => aggiorna(w.id, patch)}
              onSposta={(dir) => sposta(w.id, dir)}
              onRimuovi={() => rimuovi(w.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Widget картичка ─────────────────────────────────────────────────────────

function WidgetCard({
  cfg,
  stats,
  modifica,
  primo,
  ultimo,
  onAggiorna,
  onSposta,
  onRimuovi,
}: {
  cfg: WidgetCfg;
  stats: Stats | null;
  modifica: boolean;
  primo: boolean;
  ultimo: boolean;
  onAggiorna: (patch: Partial<WidgetCfg>) => void;
  onSposta: (dir: -1 | 1) => void;
  onRimuovi: () => void;
}) {
  const titolo =
    cfg.titolo ??
    (cfg.tipo === "kpi"
      ? "Indicatori"
      : cfg.tipo === "scadenze"
        ? "Scadenze imminenti (30 gg)"
        : cfg.tipo === "scorte"
          ? "Articoli sotto scorta"
          : (FONTI[cfg.fonte ?? ""]?.label ?? "Grafico"));

  return (
    <section className="card p-5" aria-label={titolo}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-text-1">{titolo}</h2>
        {modifica && (
          <div className="flex flex-wrap items-center gap-1.5">
            {cfg.tipo === "grafico" && (
              <>
                <select
                  className="input h-8 w-36 text-xs"
                  value={cfg.fonte}
                  onChange={(e) => onAggiorna({ fonte: e.target.value })}
                  aria-label="Fonte dati"
                >
                  {Object.entries(FONTI).map(([k, f]) => (
                    <option key={k} value={k}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <select
                  className="input h-8 w-24 text-xs"
                  value={cfg.grafico}
                  onChange={(e) =>
                    onAggiorna({ grafico: e.target.value as TipoGrafico })
                  }
                  aria-label="Tipo grafico"
                >
                  <option value="bar">Barre</option>
                  <option value="line">Linee</option>
                  <option value="area">Area</option>
                  <option value="donut">Anello</option>
                </select>
                <ScegliColore
                  valore={cfg.colore ?? "multi"}
                  onCambia={(colore) => onAggiorna({ colore })}
                />
              </>
            )}
            <button
              className="btn-ghost inline-flex h-8 items-center gap-1 px-2 text-xs"
              onClick={() =>
                onAggiorna({ larghezza: cfg.larghezza === 1 ? 2 : 1 })
              }
              title="Larghezza"
            >
              <IcoLarghezza />
              {cfg.larghezza === 1 ? "Allarga" : "Restringi"}
            </button>
            <button
              className="btn-ghost inline-flex h-8 items-center gap-1 px-2 text-xs"
              disabled={primo}
              onClick={() => onSposta(-1)}
              aria-label="Sposta su"
            >
              <IcoSu />
            </button>
            <button
              className="btn-ghost inline-flex h-8 items-center gap-1 px-2 text-xs"
              disabled={ultimo}
              onClick={() => onSposta(1)}
              aria-label="Sposta giù"
            >
              <IcoGiu />
            </button>
            <button
              className="btn-ghost inline-flex h-8 items-center px-2 text-xs text-danger-text"
              onClick={onRimuovi}
              aria-label="Rimuovi widget"
            >
              <IcoChiudi />
            </button>
          </div>
        )}
      </div>

      {!stats ? (
        <div
          className="space-y-3 py-4"
          role="status"
          aria-label="Caricamento in corso"
        >
          <Barra className="h-3 w-32" />
          <Barra className="h-40 w-full" />
        </div>
      ) : (
        <ContenutoWidget cfg={cfg} stats={stats} />
      )}
    </section>
  );
}

function ScegliColore({
  valore,
  onCambia,
}: {
  valore: "multi" | number;
  onCambia: (v: "multi" | number) => void;
}) {
  return (
    <div
      className="flex items-center gap-1"
      role="radiogroup"
      aria-label="Colore"
    >
      <button
        role="radio"
        aria-checked={valore === "multi"}
        title="Multicolore"
        className={`h-6 w-6 rounded-sm border ${valore === "multi" ? "border-border-strong ring-2 ring-[var(--ring)]" : "border-border"}`}
        style={{
          background:
            "conic-gradient(var(--chart-1),var(--chart-2),var(--chart-4),var(--chart-5),var(--chart-1))",
        }}
        onClick={() => onCambia("multi")}
      />
      {COLORI_GRAFICO.map((c, i) => (
        <button
          key={i}
          role="radio"
          aria-checked={valore === i + 1}
          title={`Colore ${i + 1}`}
          className={`h-6 w-6 rounded-sm border ${valore === i + 1 ? "border-border-strong ring-2 ring-[var(--ring)]" : "border-border"}`}
          style={{ background: c }}
          onClick={() => onCambia(i + 1)}
        />
      ))}
    </div>
  );
}

// ── Съдържание по тип ───────────────────────────────────────────────────────

function ContenutoWidget({ cfg, stats }: { cfg: WidgetCfg; stats: Stats }) {
  if (cfg.tipo === "kpi") return <RigaKpi stats={stats} />;
  if (cfg.tipo === "scadenze") return <ListaScadenze stats={stats} />;
  if (cfg.tipo === "scorte") return <ListaScorte stats={stats} />;

  const fonte = cfg.fonte ?? "ordiniPerStato";
  const def = FONTI[fonte];
  if (!def) return <p className="text-sm text-text-3">Fonte sconosciuta</p>;

  if (def.serie) {
    const dati = stats.fatturatoMensile;
    if (!dati)
      return (
        <p className="py-8 text-center text-sm text-text-3">
          Dati economici visibili dal livello Direzione
        </p>
      );
    return (
      <GraficoSerie
        fonte={fonte}
        titolo={def.label}
        dati={dati}
        serie={def.serie}
        tipo={cfg.grafico === "donut" ? "bar" : (cfg.grafico ?? "area")}
        colore={cfg.colore ?? "multi"}
      />
    );
  }

  const dati = stats[fonte as keyof Stats] as PuntoCategoria[] | undefined;
  if (!dati?.length)
    return (
      <p className="py-8 text-center text-sm text-text-3">
        Nessun dato disponibile
      </p>
    );
  return (
    <GraficoCategorie
      fonte={fonte}
      titolo={def.label}
      dati={dati}
      tipo={cfg.grafico ?? "bar"}
      colore={cfg.colore ?? "multi"}
    />
  );
}

function RigaKpi({ stats }: { stats: Stats }) {
  const k = stats.kpi;
  const voci: {
    label: string;
    valore: number | string;
    href: string;
    critico?: boolean;
  }[] = [
    { label: "Impianti gestiti", valore: k.impiantiTotali, href: "/impianti" },
    { label: "Ordini aperti", valore: k.ordiniAperti, href: "/ordini" },
    {
      label: "Preventivi in attesa",
      valore: k.preventiviInAttesa,
      href: "/preventivi",
    },
    {
      label: "Scadenze entro 30 gg",
      valore: k.scadenze30gg,
      href: "/scadenze",
      critico: k.scadenze30gg > 0,
    },
    {
      label: "Sotto scorta",
      valore: k.sottoScorta,
      href: "/magazzino",
      critico: k.sottoScorta > 0,
    },
    {
      label: "Automezzi in rosso",
      valore: k.automezziRosso,
      href: "/automezzi",
      critico: k.automezziRosso > 0,
    },
  ];
  if (stats.insoluti)
    voci.push({
      label: `Insoluti (${stats.insoluti.numero})`,
      valore: euro(stats.insoluti.totale),
      href: "/fatture",
      critico: stats.insoluti.numero > 0,
    });

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
      {voci.map((v) => (
        <Link
          key={v.label}
          href={v.href}
          className="rounded-md border border-border bg-bg p-3 transition-colors duration-150 hover:bg-surface-2"
        >
          <div className="text-xs text-text-3">{v.label}</div>
          <div
            className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${v.critico ? "text-danger-text" : "text-text-1"}`}
          >
            {v.valore}
          </div>
        </Link>
      ))}
    </div>
  );
}

function ListaScadenze({ stats }: { stats: Stats }) {
  if (stats.scadenzeProssime.length === 0)
    return (
      <p className="py-8 text-center text-sm text-text-3">
        Nessuna scadenza nei prossimi 30 giorni
      </p>
    );
  return (
    <ul className="space-y-2">
      {stats.scadenzeProssime.map((s) => (
        <li
          key={s.id}
          className="flex items-center justify-between gap-2 text-sm"
        >
          <span>
            <span className="font-mono font-medium">
              {s.impianto.matricola}
            </span>
            <span className="text-text-2"> · {s.tipo}</span>
            {s.impianto.indirizzo && (
              <span className="text-text-3"> · {s.impianto.indirizzo}</span>
            )}
          </span>
          <span className="shrink-0 font-mono text-xs text-warning-text">
            {dataIt(s.dataScadenza)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ListaScorte({ stats }: { stats: Stats }) {
  if (stats.sottoScorta.length === 0)
    return (
      <p className="py-8 text-center text-sm text-text-3">
        Tutte le giacenze sopra soglia
      </p>
    );
  return (
    <ul className="space-y-2">
      {stats.sottoScorta.map((a) => (
        <li
          key={a.id}
          className="flex items-center justify-between gap-2 text-sm"
        >
          <span>
            <span className="font-mono font-medium">{a.codice}</span>
            <span className="text-text-2"> · {a.nome}</span>
          </span>
          <span className="shrink-0 font-mono text-xs">
            <span className="font-semibold text-danger-text">{a.quantita}</span>
            <span className="text-text-3"> / soglia {a.sogliaMinima}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
