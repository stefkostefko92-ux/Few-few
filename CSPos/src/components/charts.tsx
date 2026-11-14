"use client";

// Колонна графика без зависимости (чист SVG). Една серия: заглавието казва какво е нарисувано,
// затова няма легенда. Правилата (dataviz): стълб ≤ 24 px със заоблен връх и прав при основата,
// тънка мрежа, етикет само на най-високия стълб, подсказка при посочване/фокус, таблица като
// достъпна алтернатива. Цветът #c47d0a е златото на марката, затъмнено до ≥ 3:1 върху фона
// (валидирано) — чистото #f5a623 е 1,97:1 и не се вижда като данни.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChartBar, Table } from "@phosphor-icons/react";

export interface ColumnDatum {
  key: string;
  /** Пълният етикет — в подсказката и таблицата. */
  label: string;
  /** Кратък етикет под стълба. */
  short: string;
  value: number;
  /** Допълнителен ред в подсказката (напр. брой бонове). */
  detail?: string;
}

const MARK = "#c47d0a";
const GRID = "#e3e8f0";
const BASE = "#c5cedb";

function niceStep(max: number, ticks: number): number {
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function columnPath(x: number, y: number, w: number, base: number): string {
  const h = base - y;
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

export function ColumnChart({
  title,
  description,
  data,
  formatValue,
  formatAxis,
  height = 220,
  emptyText = "Няма данни за периода.",
}: {
  title: string;
  description?: string;
  data: ColumnDatum[];
  formatValue: (v: number) => string;
  formatAxis: (v: number) => string;
  height?: number;
  emptyText?: string;
}) {
  const [wrapRef, width] = useWidth<HTMLDivElement>(640);
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const [grown, setGrown] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const t = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const geo = useMemo(() => {
    const max = Math.max(0, ...data.map((d) => d.value));
    const step = max > 0 ? niceStep(max, 4) : 1;
    const top = Math.max(step, Math.ceil(max / step) * step);
    const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
    const left = Math.max(...ticks.map((t) => formatAxis(t).length)) * 6.6 + 14;
    const m = { top: 24, right: 8, bottom: 28, left };
    const innerW = Math.max(40, width - m.left - m.right);
    const innerH = height - m.top - m.bottom;
    const band = innerW / Math.max(1, data.length);
    const barW = Math.max(2, Math.min(24, band * 0.62));
    const y = (v: number) => m.top + innerH - (v / top) * innerH;
    const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(innerW / 46))));
    const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);
    return { m, innerW, innerH, band, barW, y, ticks, every, peak, max, base: m.top + innerH };
  }, [data, width, height, formatAxis]);

  const peakDatum = data[geo.peak];
  const summary =
    geo.max > 0 && peakDatum
      ? `${title}: най-високо ${peakDatum.label} — ${formatValue(peakDatum.value)}.`
      : `${title}: ${emptyText}`;

  const tip = active !== null ? data[active] : null;
  const tipX = active !== null ? geo.m.left + geo.band * active + geo.band / 2 : 0;
  const tipY = tip ? geo.y(tip.value) : 0;

  return (
    <section className="card p-5" aria-labelledby={titleId}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 id={titleId} className="font-bold">
            {title}
          </h2>
          {description && <p className="text-xs text-ink-400 mt-0.5">{description}</p>}
        </div>
        <button
          type="button"
          className="chip !py-1 !px-2.5 text-xs"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          title={asTable ? "Покажи графиката" : "Покажи като таблица"}
        >
          {asTable ? <ChartBar size={14} /> : <Table size={14} />}
          {asTable ? "Графика" : "Таблица"}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-[260px] overflow-y-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Период</th>
                <th className="text-right">Стойност</th>
                {data.some((d) => d.detail) && <th className="text-right">Подробности</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key}>
                  <td>{d.label}</td>
                  <td className="text-right tabular-nums font-semibold">{formatValue(d.value)}</td>
                  {data.some((x) => x.detail) && <td className="text-right text-ink-400">{d.detail ?? ""}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrapRef} className="relative">
          {geo.max === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-400 pointer-events-none">
              {emptyText}
            </div>
          )}
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={summary}
            tabIndex={0}
            className="block outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 rounded-xl"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") setActive((a) => Math.min(data.length - 1, (a ?? -1) + 1));
              else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? data.length) - 1));
              else if (e.key === "Escape") setActive(null);
            }}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
          >
            {geo.ticks.map((t) => (
              <g key={t}>
                <line
                  x1={geo.m.left}
                  x2={geo.m.left + geo.innerW}
                  y1={geo.y(t)}
                  y2={geo.y(t)}
                  stroke={t === 0 ? BASE : GRID}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text x={geo.m.left - 8} y={geo.y(t)} dy="0.32em" textAnchor="end" className="fill-ink-500 text-[11px] tabular-nums">
                  {formatAxis(t)}
                </text>
              </g>
            ))}

            <g
              style={{
                transformOrigin: `0 ${geo.base}px`,
                transform: grown ? "scaleY(1)" : "scaleY(0)",
                transition: "transform .6s cubic-bezier(.22,1,.36,1)",
              }}
            >
              {data.map((d, i) => {
                const x = geo.m.left + geo.band * i + (geo.band - geo.barW) / 2;
                return (
                  <path
                    key={d.key}
                    d={columnPath(x, geo.y(d.value), geo.barW, geo.base)}
                    fill={MARK}
                    opacity={active === null || active === i ? 1 : 0.38}
                    style={{ transition: "opacity .15s" }}
                  />
                );
              })}
            </g>

            {geo.max > 0 && peakDatum && active === null && (
              <text
                x={geo.m.left + geo.band * geo.peak + geo.band / 2}
                y={geo.y(peakDatum.value) - 7}
                textAnchor="middle"
                className="fill-ink-200 text-[11px] font-semibold tabular-nums"
              >
                {formatValue(peakDatum.value)}
              </text>
            )}

            {data.map((d, i) =>
              i % geo.every === 0 ? (
                <text
                  key={`x-${d.key}`}
                  x={geo.m.left + geo.band * i + geo.band / 2}
                  y={geo.base + 18}
                  textAnchor="middle"
                  className="fill-ink-500 text-[11px] tabular-nums"
                >
                  {d.short}
                </text>
              ) : null
            )}

            {/* цялата лента е зона за посочване — по-голяма от стълба */}
            {data.map((d, i) => (
              <rect
                key={`hit-${d.key}`}
                x={geo.m.left + geo.band * i}
                y={geo.m.top}
                width={geo.band}
                height={geo.innerH}
                fill="transparent"
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
              />
            ))}
          </svg>

          {tip && (
            <div
              role="status"
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl bg-white/95 px-3 py-2 text-xs shadow-pop backdrop-blur-xl border border-black/[0.06] whitespace-nowrap"
              style={{ left: Math.min(Math.max(tipX, 70), width - 70), top: Math.max(tipY - 10, 46) }}
            >
              <div className="font-bold text-sm text-ink-100 tabular-nums">{formatValue(tip.value)}</div>
              <div className="text-ink-400">{tip.label}</div>
              {tip.detail && <div className="text-ink-400">{tip.detail}</div>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Евро за оста: „0 €“, „50 €“, „1,2 хил. €“ — кратко, един стил на ос. */
export function euroAxis(cents: number): string {
  const eur = cents / 100;
  if (eur >= 1000) return `${(eur / 1000).toLocaleString("bg-BG", { maximumFractionDigits: 1 })} хил. €`;
  return `${eur.toLocaleString("bg-BG", { maximumFractionDigits: eur < 10 && eur % 1 !== 0 ? 2 : 0 })} €`;
}
