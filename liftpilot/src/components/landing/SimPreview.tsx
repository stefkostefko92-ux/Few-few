'use client';

// The emergency stop of the landing's sample installation as the simulation runs it, in the manner of the app's
// charts (the same classes): the car's speed and T1/T2 at the sheave on one time axis, one quantity per chart, the
// limit e^(f·α) dashed from the brake's closing with the failing side washed, the brake's closing and the stop marked,
// the peak labelled. Drawn on the server at a default width, then at the chart's own width in CSS pixels (the box keeps
// its height); pointing at a chart shows the values at that instant on both.
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { makeFmt } from '@/lib/present/tr';

const VH = 150, X0 = 46, PAD_R = 12, Y0 = 16, Y1 = 124, DEFAULT_W = 600;

export interface SimPreviewText {
  speed: string;
  ratio: string;
  limit: string;
  brake: string;
  stop: string;
  time: string;
  peak: string;
}

interface Props {
  t0: number;
  dt: number;
  v: readonly number[];
  ratio: readonly number[];
  limit: readonly (number | null)[];
  brakeOn: number;
  carStop: number;
  intlLocale: string;
  text: SimPreviewText;
}

function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count), p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

interface Scale { ticks: number[]; y(v: number): number }

function scale(values: readonly (number | null)[], zero: boolean, roomAbove: boolean): Scale {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) if (v !== null && Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (zero) lo = Math.min(lo, 0);
  if (roomAbove) hi += (hi - lo) * 0.18;
  const step = niceStep(hi - lo, 4), y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = y0; v <= y1 + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { ticks, y: (v) => Y1 - ((Y1 - Y0) * (v - y0)) / (y1 - y0) };
}

export default function SimPreview({ t0, dt, v, ratio, limit, brakeOn, carStop, intlLocale, text }: Props) {
  const fmt = useMemo(() => makeFmt(intlLocale), [intlLocale]);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(DEFAULT_W);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = v.length, T = (n - 1) * dt, X1 = W - PAD_R;
  const x = (t: number): number => X0 + ((X1 - X0) * (t - t0)) / T;
  const path = (vals: readonly (number | null)[], y: (v: number) => number): string => {
    let d = '', pen = false;
    vals.forEach((val, i) => {
      if (val === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(t0 + i * dt).toFixed(1)},${y(val).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const sv = scale(v, true, false), sr = scale([...ratio, ...limit], false, true);
  const iPeak = ratio.reduce((best, r, i) => (r > ratio[best] ? i : best), 0), lim = limit.find((l): l is number => l !== null) ?? 0;
  const iOn = limit.findIndex((l) => l !== null);
  const wash = iOn < 0 ? '' : `${path(limit, sr.y)}L${x(t0 + (n - 1) * dt).toFixed(1)},${Y0}L${x(t0 + iOn * dt).toFixed(1)},${Y0}Z`;
  const ticksT: number[] = [];
  for (let t = Math.ceil(t0 * 2) / 2; t <= t0 + T + 1e-9; t += 0.5) ticksT.push(Math.round(t * 2) / 2);
  const shownT = ticksT.filter((_, k) => W >= 480 || k % 2 === 0);

  const pick = (e: PointerEvent<SVGRectElement>): void => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.min(Math.max(Math.round((((e.clientX - r.left) / r.width) * T) / dt), 0), n - 1));
  };
  const hx = hover === null ? 0 : x(t0 + hover * dt);
  const events = [{ t: brakeOn, label: text.brake }, { t: carStop, label: text.stop }];

  const chart = (id: 'v' | 'ratio', title: string, unit: string, s: Scale, dec: number, body: ReactNode, tip: ReactNode): ReactNode => (
    <figure className="sim-chart">
      <figcaption>
        <span className="title">{title}{unit ? <small> [{unit}]</small> : null}</span>
      </figcaption>
      <div className="plot">
        <svg viewBox={`0 0 ${W} ${VH}`} width={W} height={VH} preserveAspectRatio="xMinYMin meet" role="img" aria-label={title}>
          {s.ticks.map((tv) => (
            <g key={tv}>
              <line className="grid" x1={X0} x2={X1} y1={s.y(tv)} y2={s.y(tv)} />
              <text className="tick" x={X0 - 6} y={s.y(tv) + 4} textAnchor="end">{fmt(tv, dec)}</text>
            </g>
          ))}
          {shownT.map((t) => <text key={t} className="tick" x={x(t)} y={VH - 6} textAnchor="middle">{fmt(t, 1)} s</text>)}
          <line className="axis" x1={X0} x2={X1} y1={Y1} y2={Y1} />
          {events.map((e) => <line key={e.label} className="lp-sim-evt" x1={x(e.t)} x2={x(e.t)} y1={Y0} y2={Y1} />)}
          {id === 'v' ? events.map((e, k) => (
            <text key={e.label} className="lp-sim-evt-label" x={x(e.t) + 5} y={Y0 + 10 + k * 14}>{e.label}</text>
          )) : null}
          {body}
          {hover !== null ? <line className="cross" x1={hx} x2={hx} y1={Y0} y2={Y1} /> : null}
          <rect className="hit" x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setHover(null)} />
        </svg>
        {hover !== null ? (
          <div className={`tip${hx > (X0 + X1) / 2 ? ' flip' : ''}`} style={{ left: `${hx}px` }}>
            {tip}
            <div className="when">{text.time} {fmt(t0 + hover * dt, 2)} s</div>
          </div>
        ) : null}
      </div>
    </figure>
  );

  const at = hover ?? 0, limAt = limit[at] ?? null;
  return (
    <div className="lp-sim" ref={box}>
      {chart('v', text.speed, 'm/s', sv, 1,
        <path className="line s1" d={path(v, sv.y)} />,
        <div><strong>{fmt(v[at] ?? 0, 2)} m/s</strong></div>)}
      {chart('ratio', text.ratio, '', sr, 2,
        <>
          {wash ? <path className="wash" d={wash} /> : null}
          <path className="limit" d={path(limit, sr.y)} />
          <text className="lp-sim-label" x={X1} y={sr.y(lim) - 6} textAnchor="end">{text.limit} {fmt(lim, 3)}</text>
          <path className="line s1" d={path(ratio, sr.y)} />
          <circle className="lp-sim-peak" cx={x(t0 + iPeak * dt)} cy={sr.y(ratio[iPeak] ?? 0)} r={4} />
          <text className="lp-sim-label" x={x(t0 + iPeak * dt) - 8} y={sr.y(ratio[iPeak] ?? 0) + 18} textAnchor="end">{text.peak}</text>
        </>,
        <>
          <div><strong>{fmt(ratio[at] ?? 0, 3)}</strong> T1/T2</div>
          {limAt !== null ? <div><strong>{fmt(limAt, 3)}</strong> {text.limit}</div> : null}
        </>)}
    </div>
  );
}
