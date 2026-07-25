"use client";

// Рендер на една графика по декларативна конфигурация (Recharts).
// Дисциплина: тънки маркове, 4px връх на колоните, 2px процеп на donut,
// フикс ред на цветовете (цветът следва категорията, не позицията),
// текстът винаги в текстови токени, tooltip навсякъде, без анимации.

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export type TipoGrafico = "bar" | "line" | "area" | "donut";

export interface PuntoCategoria {
  nome: string;
  valore: number;
}

export interface PuntoSerie {
  nome: string;
  [serie: string]: string | number;
}

export const COLORI_GRAFICO = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

// Статусните цветове са запазени — никога не се преизползват като „серия N".
export const COLORI_STATUS: Record<string, string> = {
  verde: "var(--success)",
  giallo: "var(--warning)",
  rosso: "var(--danger)",
};

/** Каноничен ред на категориите: цветът следва КАТЕГОРИЯТА, не реда в данните. */
const ORDINE_CANONICO: Record<string, string[]> = {
  ordiniPerStato: [
    "BOZZA",
    "EMESSO",
    "CONFERMATO",
    "IN_LAVORO",
    "SOSPESO",
    "COMPLETATO",
    "CHIUSO",
    "CONTESTATO",
    "ANNULLATO",
  ],
  ordiniPerPriorita: ["ORDINARIA", "URGENTE", "EMERGENZA"],
  preventiviPerStato: ["BOZZA", "INVIATO", "APPROVATO", "RIFIUTATO", "SCADUTO"],
  impiantiPerStato: ["ATTIVO", "FERMO", "MANUTENZIONE", "FUORI_SERVIZIO", "DISMESSO"],
  automezziPerStato: ["verde", "giallo", "rosso"],
};

export function coloreCategoria(
  fonte: string,
  nome: string,
  indice: number,
  colore: "multi" | number
): string {
  if (fonte === "automezziPerStato") return COLORI_STATUS[nome] ?? COLORI_GRAFICO[7];
  if (colore !== "multi") return COLORI_GRAFICO[(colore - 1) % 8];
  const canonico = ORDINE_CANONICO[fonte];
  const pos = canonico ? canonico.indexOf(nome) : indice;
  return COLORI_GRAFICO[(pos >= 0 ? pos : indice) % 8];
}

export function ordinaCanonico(fonte: string, dati: PuntoCategoria[]): PuntoCategoria[] {
  const canonico = ORDINE_CANONICO[fonte];
  if (!canonico) return dati;
  return [...dati].sort((a, b) => canonico.indexOf(a.nome) - canonico.indexOf(b.nome));
}

function TooltipCard({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number | string; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-md">
      {label && <div className="mb-1 font-medium text-text-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-text-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color }}
            aria-hidden
          />
          {p.name}: <span className="font-mono font-medium text-text-1">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

const ASSI = {
  tick: { fill: "var(--text-3)", fontSize: 11 },
  axisLine: false as const,
  tickLine: false as const,
};

/** Категорийна графика (една стойност по категория). */
export function GraficoCategorie({
  fonte,
  dati,
  tipo,
  colore,
}: {
  fonte: string;
  dati: PuntoCategoria[];
  tipo: TipoGrafico;
  colore: "multi" | number;
}) {
  const ordinati = ordinaCanonico(fonte, dati);

  if (tipo === "donut") {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Tooltip content={<TooltipCard />} />
          <Pie
            data={ordinati}
            dataKey="valore"
            nameKey="nome"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={2}
            stroke="var(--surface)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {ordinati.map((p, i) => (
              <Cell key={p.nome} fill={coloreCategoria(fonte, p.nome, i, colore)} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (tipo === "line" || tipo === "area") {
    const c = colore === "multi" ? COLORI_GRAFICO[0] : COLORI_GRAFICO[(colore - 1) % 8];
    const Contenitore = tipo === "line" ? LineChart : AreaChart;
    return (
      <ResponsiveContainer width="100%" height={240}>
        <Contenitore data={ordinati} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="nome" {...ASSI} interval={0} tickFormatter={(v) => String(v).slice(0, 6)} />
          <YAxis {...ASSI} allowDecimals={false} />
          <Tooltip content={<TooltipCard />} />
          {tipo === "line" ? (
            <Line
              dataKey="valore"
              name="valore"
              stroke={c}
              strokeWidth={2}
              dot={{ r: 3, fill: c, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          ) : (
            <Area
              dataKey="valore"
              name="valore"
              stroke={c}
              strokeWidth={2}
              fill={c}
              fillOpacity={0.15}
              isAnimationActive={false}
            />
          )}
        </Contenitore>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={ordinati} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="25%">
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="nome" {...ASSI} interval={0} tickFormatter={(v) => String(v).slice(0, 6)} />
        <YAxis {...ASSI} allowDecimals={false} />
        <Tooltip content={<TooltipCard />} cursor={{ fill: "var(--surface-2)" }} />
        <Bar dataKey="valore" name="valore" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
          {ordinati.map((p, i) => (
            <Cell key={p.nome} fill={coloreCategoria(fonte, p.nome, i, colore)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Времева графика с няколко серии (fatturato: emesso / incassato). */
export function GraficoSerie({
  dati,
  serie,
  tipo,
  colore,
}: {
  dati: PuntoSerie[];
  serie: { chiave: string; label: string }[];
  tipo: TipoGrafico;
  colore: "multi" | number;
}) {
  const colori = serie.map((_, i) =>
    colore === "multi" ? COLORI_GRAFICO[i % 8] : COLORI_GRAFICO[((colore - 1) + i) % 8]
  );
  const Contenitore = tipo === "line" ? LineChart : tipo === "area" ? AreaChart : BarChart;

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <Contenitore data={dati} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap="25%">
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="nome" {...ASSI} />
          <YAxis {...ASSI} />
          <Tooltip content={<TooltipCard />} cursor={tipo === "bar" ? { fill: "var(--surface-2)" } : undefined} />
          {serie.map((s, i) =>
            tipo === "line" ? (
              <Line
                key={s.chiave}
                dataKey={s.chiave}
                name={s.label}
                stroke={colori[i]}
                strokeWidth={2}
                dot={{ r: 3, fill: colori[i], strokeWidth: 0 }}
                isAnimationActive={false}
              />
            ) : tipo === "area" ? (
              <Area
                key={s.chiave}
                dataKey={s.chiave}
                name={s.label}
                stroke={colori[i]}
                strokeWidth={2}
                fill={colori[i]}
                fillOpacity={0.15}
                isAnimationActive={false}
              />
            ) : (
              <Bar
                key={s.chiave}
                dataKey={s.chiave}
                name={s.label}
                fill={colori[i]}
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
                isAnimationActive={false}
              />
            )
          )}
        </Contenitore>
      </ResponsiveContainer>
      {/* легенда: ≥2 серии → винаги присъства */}
      <div className="mt-2 flex flex-wrap gap-4 px-2">
        {serie.map((s, i) => (
          <span key={s.chiave} className="flex items-center gap-1.5 text-xs text-text-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: colori[i] }} aria-hidden />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
