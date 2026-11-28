// frontend/src/components/charts/AreaChart.jsx
// Двусерийна площна графика (отворени/затворени тикети по дни) — <canvas>, нула
// зависимости. Беше inline SVG; правилото на собственика „никога SVG — графиките
// са <canvas>“ (2026-11-04/27). Поведението е същото, а мащабът — по-честен:
// рисува се в истинските пиксели на кутията (SVG-то се свиваше равномерно и
// текстът ставаше дребен на тясно).
//
// Дисциплина (dataviz): една ос (никога dual-axis), плътни косъмни решетъчни
// линии, 2px щрихи, легенда ЗАДЪЛЖИТЕЛНО при ≥2 серии + директни етикети на
// края на всяка серия (вторично кодиране — двойката е в 6–8 tritan лентата),
// crosshair + tooltip по подразбиране, и table view близнак, за да не е
// tooltip-ът единственият начин да прочетеш стойност.
import { useEffect, useMemo, useRef, useState } from "react";
import { Table2, LineChart as LineIcon } from "../icons";
import { SERIES, GRID, AXIS_TEXT } from "./palette";
import { useT } from "../../contexts/I18nContext";

const PAD = { top: 14, right: 54, bottom: 24, left: 34 };
const FONT = '"Inter Tight", Inter, system-ui, sans-serif';

/** Точките на двете серии в пикселите на кутията (чиста функция — тества се отделно). */
export function layoutPoints(data, W, H) {
  const plotW = Math.max(1, W - PAD.left - PAD.right);
  const plotH = Math.max(1, H - PAD.top - PAD.bottom);
  const max = Math.max(1, ...data.map((d) => Math.max(d.opened || 0, d.closed || 0)));
  const step = data.length > 1 ? plotW / (data.length - 1) : 0;
  const y = (v) => PAD.top + plotH - (v / max) * plotH;
  const pts = data.map((d, i) => ({ ...d, x: PAD.left + i * step, yOpened: y(d.opened || 0), yClosed: y(d.closed || 0) }));
  return { pts, max, plotW, plotH, step };
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export default function AreaChart({ data = [], height = 220, className = "" }) {
  const { t } = useT();
  const [hover, setHover] = useState(null); // индекс на активната точка
  const [asTable, setAsTable] = useState(false);
  const [width, setWidth] = useState(0);
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const H = height;

  // Ширината на кутията — платното се рисува в нея 1:1 (× devicePixelRatio).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const measure = () => setWidth(Math.round(el.clientWidth));
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [asTable]);

  const geo = useMemo(() => layoutPoints(data, width || 720, H), [data, width, H]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !width || !data.length) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(H * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, H);
    const { pts, max, plotH } = geo;
    const bottom = PAD.top + plotH;
    ctx.font = `10px ${FONT}`;
    ctx.textBaseline = "middle";

    // Решетка: плътни косъмни линии (никога пунктир) + стойност на оста — 3 нива.
    for (const f of [0, 0.5, 1]) {
      const y = Math.round(PAD.top + plotH - f * plotH) + 0.5;
      ctx.strokeStyle = GRID; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(width - PAD.right, y); ctx.stroke();
      ctx.fillStyle = AXIS_TEXT; ctx.textAlign = "right";
      ctx.fillText(String(Math.round(max * f)), PAD.left - 8, y);
    }

    const trace = (key) => { pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p[key]) : ctx.moveTo(p.x, p[key]))); };
    const fill = (key, color, a0) => {
      const g = ctx.createLinearGradient(0, PAD.top, 0, bottom);
      g.addColorStop(0, hexA(color, a0)); g.addColorStop(1, hexA(color, 0.02));
      ctx.beginPath(); trace(key);
      ctx.lineTo(pts.at(-1).x, bottom); ctx.lineTo(pts[0].x, bottom); ctx.closePath();
      ctx.fillStyle = g; ctx.fill();
    };
    const stroke = (key, color) => {
      ctx.beginPath(); trace(key);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
    };
    fill("yClosed", SERIES.closed.stroke, 0.26);
    fill("yOpened", SERIES.opened.stroke, 0.34);
    stroke("yClosed", SERIES.closed.stroke);
    stroke("yOpened", SERIES.opened.stroke);

    // Директни етикети на края — вторичното кодиране до легендата.
    const last = pts.at(-1);
    ctx.font = `11px ${FONT}`; ctx.textAlign = "left";
    ctx.fillStyle = SERIES.opened.stroke; ctx.fillText(String(last.opened), last.x + 8, last.yOpened);
    ctx.fillStyle = SERIES.closed.stroke; ctx.fillText(String(last.closed), last.x + 8, last.yClosed);

    // Оста X: само първи/среден/последен ден — иначе етикетите се сблъскват.
    ctx.font = `10px ${FONT}`; ctx.fillStyle = AXIS_TEXT;
    const fmtDay = (s) => { const d = new Date(s); return `${d.getDate()}/${d.getMonth() + 1}`; };
    [0, Math.floor(pts.length / 2), pts.length - 1].forEach((i) => {
      ctx.textAlign = i === 0 ? "left" : i === pts.length - 1 ? "right" : "center";
      ctx.fillText(fmtDay(pts[i].day), pts[i].x, H - 7);
    });

    // Мерник + маркери; 2px пръстен в цвета на повърхността при застъпване.
    if (hover != null && pts[hover]) {
      const p = pts[hover];
      ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(p.x) + 0.5, PAD.top); ctx.lineTo(Math.round(p.x) + 0.5, bottom); ctx.stroke();
      for (const [key, color] of [["yClosed", SERIES.closed.stroke], ["yOpened", SERIES.opened.stroke]]) {
        ctx.beginPath(); ctx.arc(p.x, p[key], 4.5, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#061010"; ctx.stroke();
      }
    }
  }, [geo, hover, width, H, data.length]);

  if (!data.length) {
    return <div className={`text-sm text-cs-muted py-10 text-center ${className}`}>{t("overview.byPanel.empty")}</div>;
  }

  const { pts, max, step } = geo;

  if (asTable) {
    return (
      <div className={className}>
        <ChartToggle asTable={asTable} onToggle={() => setAsTable(false)} />
        <div className="overflow-x-auto max-h-[220px] overflow-y-auto mt-2">
          <table className="cs-table text-xs w-full">
            <thead><tr><th>{t("overview.chart.day")}</th><th className="text-right">{t("overview.chart.opened")}</th><th className="text-right">{t("overview.chart.closed")}</th></tr></thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.day}>
                  <td className="tabular-nums">{d.day}</td>
                  <td className="text-right tabular-nums">{d.opened}</td>
                  <td className="text-right tabular-nums">{d.closed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3 mb-1">
        {/* Легендата е задължителна при ≥2 серии — идентичността никога само по цвят */}
        <div className="flex items-center gap-4">
          {Object.entries(SERIES).map(([key, s]) => (
            <span key={key} className="flex items-center gap-1.5 text-xs text-cs-muted">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.stroke }} aria-hidden="true" />
              {key === "opened" ? t("overview.chart.opened") : t("overview.chart.closed")}
            </span>
          ))}
        </div>
        <ChartToggle asTable={asTable} onToggle={() => setAsTable(true)} />
      </div>

      <div ref={boxRef} className="w-full" style={{ height }}>
        <canvas
          ref={canvasRef}
          className="block w-full"
          style={{ height }}
          role="img"
          aria-label={`Ticket activity: ${data.length} days, peak ${max} per day. Switch to table view for exact values.`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const i = step > 0 ? Math.round((e.clientX - r.left - PAD.left) / step) : 0;
            setHover(i >= 0 && i < pts.length ? i : null);
          }}
        />
      </div>

      {/* Подсказката е под платното — по-лесно се стилизира и не се реже */}
      <div className="h-5 mt-1 text-xs text-cs-muted tabular-nums" aria-live="polite">
        {hover != null && pts[hover] && (
          <span>
            {pts[hover].day} · <span style={{ color: SERIES.opened.stroke }}>{pts[hover].opened} {t("overview.chart.opened").toLowerCase()}</span>
            {" · "}<span style={{ color: SERIES.closed.stroke }}>{pts[hover].closed} {t("overview.chart.closed").toLowerCase()}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function ChartToggle({ asTable, onToggle }) {
  const { t } = useT();
  const label = asTable ? t("overview.chart.showChart") : t("overview.chart.showTable");
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-cs-dim hover:text-cs-cyan transition-colors p-1"
      title={label}
      aria-label={label}
    >
      {asTable ? <LineIcon className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
    </button>
  );
}
