import type { PricePoint } from "@car-monitor/api-contract";
import { formatEur } from "@car-monitor/shared";

// Лек inline SVG sparkline за медианната цена по месеци (без външни зависимости).
export function PriceChart({ points }: { points: PricePoint[] }) {
  const data = points.filter((p) => p.medianPriceEur != null) as Array<
    PricePoint & { medianPriceEur: number }
  >;
  if (data.length < 2) {
    return <p className="muted">Недостатъчно данни за графика на цените.</p>;
  }

  const w = 600;
  const h = 160;
  const pad = 28;
  const xs = data.map((_, i) => pad + (i * (w - 2 * pad)) / (data.length - 1));
  const values = data.map((d) => d.medianPriceEur);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${xs[i]!.toFixed(1)},${y(d.medianPriceEur).toFixed(1)}`).join(" ");

  return (
    <figure style={{ margin: "12px 0" }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Медианна цена по месеци">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="var(--line)" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
        {data.map((d, i) => (
          <circle key={d.period} cx={xs[i]} cy={y(d.medianPriceEur)} r="3" fill="var(--accent)">
            <title>{`${d.period}: ${formatEur(d.medianPriceEur)} (${d.listings} обяви)`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="muted">
        {data[0]!.period} → {data[data.length - 1]!.period} · от {formatEur(min)} до {formatEur(max)}
      </figcaption>
    </figure>
  );
}
