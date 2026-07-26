"use client";

// Рендер на една графика по декларативна конфигурация (Recharts).
// Дисциплина: тънки маркове, 4px връх на колоните, 2px процеп на donut,
// フикс ред на цветовете (цветът следва категорията, не позицията),
// текстът винаги в текстови токени, tooltip навсякъде, без анимации.

import {
  STATO_LABEL,
  PRIORITA_LABEL,
  TIPO_SCADENZA,
  STATO_AUTOMEZZO,
} from "@/lib/enum-labels";
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
  impiantiPerStato: [
    "ATTIVO",
    "FERMO",
    "MANUTENZIONE",
    "FUORI_SERVIZIO",
    "DISMESSO",
  ],
  automezziPerStato: ["verde", "giallo", "rosso"],
};

export function coloreCategoria(
  fonte: string,
  nome: string,
  indice: number,
  colore: "multi" | number,
): string {
  if (fonte === "automezziPerStato")
    return COLORI_STATUS[nome] ?? COLORI_GRAFICO[7];
  if (colore !== "multi") return COLORI_GRAFICO[(colore - 1) % 8];
  const canonico = ORDINE_CANONICO[fonte];
  const pos = canonico ? canonico.indexOf(nome) : indice;
  return COLORI_GRAFICO[(pos >= 0 ? pos : indice) % 8];
}

export function ordinaCanonico(
  fonte: string,
  dati: PuntoCategoria[],
): PuntoCategoria[] {
  const canonico = ORDINE_CANONICO[fonte];
  if (!canonico) return dati;
  return [...dati].sort(
    (a, b) => canonico.indexOf(a.nome) - canonico.indexOf(b.nome),
  );
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
          {p.name}:{" "}
          <span className="font-mono font-medium text-text-1">{p.value}</span>
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

/**
 * Етикетът на категория — СЪЩИЯТ, който се вижда на екрана.
 *
 * ЗАЩО НЕ САМО МАХАНЕ НА ДОЛНА ЧЕРТА. Скритата таблица Е графиката за
 * незрящия оператор; тя му четеше вътрешни константи („IN LAVORO", „FUORI
 * SERVIZIO"), докато видимият интерфейс до нея е на италиански. Достъпният
 * път беше непреведен, а axe не вижда това. Замяната на долните черти остава
 * като резервен вариант за стойност извън речника.
 */
export function etichettaAsse(v: string): string {
  const noto =
    STATO_LABEL[v] ??
    PRIORITA_LABEL[v] ??
    STATO_AUTOMEZZO[v] ??
    TIPO_SCADENZA[v];
  return noto ?? String(v).replaceAll("_", " ");
}

/**
 * Данните на графиката като таблица — скрита за окото, видима за четеца.
 *
 * Графиката е ГЛЕДКА към числата, а не самите числа. За екранен четец SVG-то е
 * шум: Recharts маркира секторите с `role="img"` без име, тоест дори добре
 * поставеният етикет би прочел осем безименни картинки. Затова платното се
 * скрива изцяло (`aria-hidden`), а тук минава текстовият еквивалент по WCAG
 * 1.1.1 — истинска таблица със заглавия, не изречение с изброени числа.
 *
 * Заглавието се подава отвън: „Ordini per stato" и „Fatturato" водят до
 * различни таблици и еднакво име би направило втората неоткриваема.
 */
function TabellaAlternativa({
  titolo,
  colonne,
  righe,
}: {
  titolo: string;
  colonne: string[];
  righe: (string | number)[][];
}) {
  return (
    <table className="sr-only">
      <caption>{titolo}</caption>
      <thead>
        <tr>
          {colonne.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {righe.map((r) => (
          <tr key={String(r[0])}>
            <th scope="row">{r[0]}</th>
            {r.slice(1).map((v, i) => (
              <td key={colonne[i + 1]}>{v}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Наклонени етикети по X — 9-те статуса се събират без застъпване и без отрязване.
const ASSE_X_CATEGORIE = {
  interval: 0 as const,
  angle: -35,
  textAnchor: "end" as const,
  height: 68,
  tickFormatter: etichettaAsse,
};

/** Категорийна графика (една стойност по категория). */
export function GraficoCategorie({
  fonte,
  titolo,
  dati,
  tipo,
  colore,
}: {
  fonte: string;
  /** Заглавието на графиката — става `<caption>` на скритата таблица. */
  titolo: string;
  dati: PuntoCategoria[];
  tipo: TipoGrafico;
  colore: "multi" | number;
}) {
  const ordinati = ordinaCanonico(fonte, dati);
  const tabella = (
    <TabellaAlternativa
      titolo={titolo}
      // Не „Voce": в този продукт „voce" вече значи ред от фактура/оферта.
      colonne={["Categoria", "Valore"]}
      righe={ordinati.map((p) => [etichettaAsse(p.nome), p.valore])}
    />
  );

  if (tipo === "donut") {
    return (
      <div>
        {tabella}
        {/* Платното е ГЛЕДКА към същите числа: за четеца е дубликат, а без
            `aria-hidden` Recharts би му подал безименни `role="img"` сектори. */}
        <div aria-hidden>
          <ResponsiveContainer width="100%" height={200}>
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
                // Recharts слага `tabindex="0"` на кръга — и слуша СОБСТВЕНОТО
                // си свойство `rootTabIndex`, не `tabIndex`. Вътре в скрито за
                // четеца поддърво фокусируемият кръг е капан: табулацията спира
                // на нещо, което не се обявява с нищо. Числата и без това са в
                // таблицата над платното.
                rootTabIndex={-1}
              >
                {ordinati.map((p, i) => (
                  <Cell
                    key={p.nome}
                    fill={coloreCategoria(fonte, p.nome, i, colore)}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {/* легенда: идентичността никога не е само по цвят */}
          <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 px-2">
            {ordinati.map((p, i) => (
              <span
                key={p.nome}
                className="flex items-center gap-1.5 text-xs text-text-2"
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background: coloreCategoria(fonte, p.nome, i, colore),
                  }}
                  aria-hidden
                />
                {etichettaAsse(p.nome)}{" "}
                <span className="font-mono text-text-1">{p.valore}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (tipo === "line" || tipo === "area") {
    const c =
      colore === "multi" ? COLORI_GRAFICO[0] : COLORI_GRAFICO[(colore - 1) % 8];
    const Contenitore = tipo === "line" ? LineChart : AreaChart;
    return (
      <div>
        {tabella}
        <div aria-hidden>
          <ResponsiveContainer width="100%" height={240}>
            <Contenitore
              data={ordinati}
              margin={{ top: 8, right: 8, bottom: 8, left: -16 }}
            >
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="nome" {...ASSI} {...ASSE_X_CATEGORIE} />
              <YAxis {...ASSI} allowDecimals={false} />
              <Tooltip content={<TooltipCard />} />
              {tipo === "line" ? (
                <Line
                  dataKey="valore"
                  name="Valore"
                  stroke={c}
                  strokeWidth={2}
                  dot={{ r: 3, fill: c, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              ) : (
                <Area
                  dataKey="valore"
                  name="Valore"
                  stroke={c}
                  strokeWidth={2}
                  fill={c}
                  fillOpacity={0.15}
                  isAnimationActive={false}
                />
              )}
            </Contenitore>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  return (
    <div>
      {tabella}
      <div aria-hidden>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={ordinati}
            margin={{ top: 8, right: 8, bottom: 8, left: -16 }}
            barCategoryGap="25%"
          >
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="nome" {...ASSI} {...ASSE_X_CATEGORIE} />
            <YAxis {...ASSI} allowDecimals={false} />
            <Tooltip
              content={<TooltipCard />}
              cursor={{ fill: "var(--surface-2)" }}
            />
            <Bar
              dataKey="valore"
              name="Valore"
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
              isAnimationActive={false}
            >
              {ordinati.map((p, i) => (
                <Cell
                  key={p.nome}
                  fill={coloreCategoria(fonte, p.nome, i, colore)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Времева графика с няколко серии (fatturato: emesso / incassato). */
export function GraficoSerie({
  titolo,
  dati,
  serie,
  tipo,
  colore,
}: {
  /** Заглавието на графиката — става `<caption>` на скритата таблица. */
  titolo: string;
  dati: PuntoSerie[];
  serie: { chiave: string; label: string }[];
  tipo: TipoGrafico;
  colore: "multi" | number;
}) {
  const colori = serie.map((_, i) =>
    colore === "multi"
      ? COLORI_GRAFICO[i % 8]
      : COLORI_GRAFICO[(colore - 1 + i) % 8],
  );
  const Contenitore =
    tipo === "line" ? LineChart : tipo === "area" ? AreaChart : BarChart;

  return (
    <div>
      <TabellaAlternativa
        titolo={titolo}
        colonne={["Periodo", ...serie.map((s) => s.label)]}
        righe={dati.map((p) => [
          String(p.nome),
          ...serie.map((s) => p[s.chiave] ?? 0),
        ])}
      />
      <div aria-hidden>
        <ResponsiveContainer width="100%" height={240}>
          <Contenitore
            data={dati}
            margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
            barCategoryGap="25%"
          >
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="nome" {...ASSI} />
            <YAxis {...ASSI} />
            <Tooltip
              content={<TooltipCard />}
              cursor={tipo === "bar" ? { fill: "var(--surface-2)" } : undefined}
            />
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
              ),
            )}
          </Contenitore>
        </ResponsiveContainer>
        {/* легенда: ≥2 серии → винаги присъства */}
        <div className="mt-2 flex flex-wrap gap-4 px-2">
          {serie.map((s, i) => (
            <span
              key={s.chiave}
              className="flex items-center gap-1.5 text-xs text-text-2"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: colori[i] }}
                aria-hidden
              />
              {s.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
