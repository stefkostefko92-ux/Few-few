// frontend/src/components/charts/AreaChart.jsx
// Двусерийна площна графика (отворени/затворени тикети по дни) — inline SVG,
// нула зависимости.
//
// Дисциплина (dataviz): една ос (никога dual-axis), плътни косъмни решетъчни
// линии, 2px щрихи, легенда ЗАДЪЛЖИТЕЛНО при ≥2 серии + директни етикети на
// края на всяка серия (вторично кодиране — двойката е в 6–8 tritan лентата),
// crosshair + tooltip по подразбиране, и table view близнак, за да не е
// tooltip-ът единственият начин да прочетеш стойност.
import { useId, useMemo, useState } from "react";
import { Table2, LineChart as LineIcon } from "lucide-react";
import { SERIES, GRID, AXIS_TEXT } from "./palette";
import { useT } from "../../contexts/I18nContext";

const PAD = { top: 14, right: 54, bottom: 24, left: 34 };

export default function AreaChart({ data = [], height = 220, className = "" }) {
  const { t } = useT();
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState(null); // индекс на активната точка
  const [asTable, setAsTable] = useState(false);
  const W = 720, H = height;

  const { pts, max, plotW, plotH } = useMemo(() => {
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const max = Math.max(1, ...data.map((d) => Math.max(d.opened || 0, d.closed || 0)));
    const step = data.length > 1 ? plotW / (data.length - 1) : 0;
    const y = (v) => PAD.top + plotH - (v / max) * plotH;
    const pts = data.map((d, i) => ({
      ...d,
      x: PAD.left + i * step,
      yOpened: y(d.opened || 0),
      yClosed: y(d.closed || 0),
    }));
    return { pts, max, plotW, plotH };
  }, [data, H]);

  if (!data.length) {
    return <div className={`text-sm text-cs-muted py-10 text-center ${className}`}>{t("overview.byPanel.empty")}</div>;
  }

  const line = (key) => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p[key].toFixed(1)}`).join(" ");
  const area = (key) =>
    `${line(key)} L${pts.at(-1).x.toFixed(1)} ${(PAD.top + plotH).toFixed(1)} L${pts[0].x.toFixed(1)} ${(PAD.top + plotH).toFixed(1)} Z`;

  // 4 хоризонтални нива — повече решетка на 220px е шум.
  const ticks = [0, 0.5, 1].map((f) => ({ v: Math.round(max * f), y: PAD.top + plotH - f * plotH }));
  const last = pts.at(-1);
  const fmtDay = (s) => {
    const d = new Date(s);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

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
                  <td className="font-mono">{d.day}</td>
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

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`Ticket activity: ${data.length} days, peak ${max} per day. Switch to table view for exact values.`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          const step = pts.length > 1 ? (plotW / (pts.length - 1)) : 1;
          const i = Math.round((x - PAD.left) / step);
          setHover(i >= 0 && i < pts.length ? i : null);
        }}
      >
        <defs>
          <linearGradient id={`g-open-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.opened.stroke} stopOpacity="0.34" />
            <stop offset="100%" stopColor={SERIES.opened.stroke} stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={`g-close-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.closed.stroke} stopOpacity="0.26" />
            <stop offset="100%" stopColor={SERIES.closed.stroke} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Решетка: плътни косъмни линии (никога пунктир) + стойност на оста */}
        {ticks.map((t) => (
          <g key={t.y}>
            <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y} stroke={GRID} strokeWidth="1" />
            <text x={PAD.left - 8} y={t.y + 3.5} textAnchor="end" fontSize="10" fill={AXIS_TEXT} className="tabular-nums">{t.v}</text>
          </g>
        ))}

        <path d={area("yClosed")} fill={`url(#g-close-${gid})`} />
        <path d={area("yOpened")} fill={`url(#g-open-${gid})`} />
        <path d={line("yClosed")} fill="none" stroke={SERIES.closed.stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={line("yOpened")} fill="none" stroke={SERIES.opened.stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Директни етикети на края — вторичното кодиране до легендата */}
        <text x={last.x + 8} y={last.yOpened + 3.5} fontSize="11" fill={SERIES.opened.stroke} className="tabular-nums">{last.opened}</text>
        <text x={last.x + 8} y={last.yClosed + 3.5} fontSize="11" fill={SERIES.closed.stroke} className="tabular-nums">{last.closed}</text>

        {/* Оста X: само първи/среден/последен ден — иначе етикетите се сблъскват */}
        {[0, Math.floor(pts.length / 2), pts.length - 1].map((i) => (
          <text key={i} x={pts[i].x} y={H - 7} textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}
            fontSize="10" fill={AXIS_TEXT}>{fmtDay(pts[i].day)}</text>
        ))}

        {/* Crosshair + маркери; 2px пръстен в цвета на повърхността при застъпване */}
        {hover != null && (
          <g pointerEvents="none">
            <line x1={pts[hover].x} y1={PAD.top} x2={pts[hover].x} y2={PAD.top + plotH} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
            <circle cx={pts[hover].x} cy={pts[hover].yClosed} r="4.5" fill={SERIES.closed.stroke} stroke="#0d130b" strokeWidth="2" />
            <circle cx={pts[hover].x} cy={pts[hover].yOpened} r="4.5" fill={SERIES.opened.stroke} stroke="#0d130b" strokeWidth="2" />
          </g>
        )}
      </svg>

      {/* Tooltip извън SVG — по-лесно се стилизира и не се реже от viewBox */}
      <div className="h-5 mt-1 text-xs text-cs-muted font-mono" aria-live="polite">
        {hover != null && (
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
