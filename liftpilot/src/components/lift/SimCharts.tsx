'use client';

// The charts of a simulation run: small multiples on one time axis, one quantity each, 2 px lines, hairline grid, the
// limit dashed with the failing side washed, a cursor at the clock's time. Each chart is drawn at its own width in CSS
// pixels (one unit of the drawing = one pixel), so text and lines keep their size at any width. Pointing at a chart
// shows the values at that instant (crosshair and tooltip); a click moves the simulation there.
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { SimRun } from '@/sim';
import type { SimClock } from './clock';
import type { ChartSpec } from './charts';

const VH = 164, X0 = 46, PAD_R = 10, Y0 = 10, Y1 = 138, DEFAULT_W = 480;

interface Props {
  specs: readonly ChartSpec[];
  run: SimRun;
  clock: SimClock;
  fmt(x: number, dec?: number): string;
  timeLabel: string;
}

function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count), p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

const at = (a: ArrayLike<number>, u: number): number => {
  const i = Math.min(Math.max(Math.floor(u), 0), a.length - 1), j = Math.min(i + 1, a.length - 1), k = u - i;
  return a[i] + (a[j] - a[i]) * Math.min(Math.max(k, 0), 1);
};

/** x of the cursor at time t on a chart whose plot spans x0..x1 */
const cursorX = (x0: number, x1: number, t: number, T: number): number => x0 + ((x1 - x0) * Math.min(Math.max(t, 0), T)) / T;

function Chart({ spec, run, T, now, fmt, hover, onHover, onSeek, cursorRef, timeLabel }: {
  spec: ChartSpec; run: SimRun; T: number; now: number; fmt: Props['fmt']; hover: number | null; timeLabel: string;
  onHover(t: number | null): void; onSeek(t: number): void; cursorRef(el: SVGLineElement | null): void;
}) {
  const dt = run.series.dt;
  const plot = useRef<HTMLDivElement>(null);
  const [VW, setVW] = useState(DEFAULT_W);
  useEffect(() => {
    const el = plot.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setVW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const X1 = VW - PAD_R;
  const geo = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    const take = (v: number): void => { if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } };
    for (const l of spec.lines) for (let i = 0; i < l.values.length; i++) take(l.values[i]);
    const lim = spec.limit?.values;
    if (typeof lim === 'number') take(lim);
    else if (lim) for (let i = 0; i < lim.length; i++) take(lim[i]);
    if (spec.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-9) { hi = lo + (Math.abs(lo) || 1) * 0.1; lo -= (Math.abs(lo) || 1) * 0.1; }
    // room on the failing side of a limit, so its wash shows even when a line runs on the limit
    if (spec.limit?.bad === 'above') hi += (hi - lo) * 0.12;
    else if (spec.limit?.bad === 'below') lo -= (hi - lo) * 0.12;
    const step = niceStep(hi - lo, 4), y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
    const x = (t: number): number => X0 + ((X1 - X0) * t) / Math.max(T, 1e-9);
    const y = (v: number): number => Y1 - ((Y1 - Y0) * (v - y0)) / (y1 - y0);
    const n = run.series.n, stride = Math.max(1, Math.ceil(n / Math.max(120, X1 - X0)));
    const path = (vals: ArrayLike<number>): string => {
      let s = '', pen = false;
      for (let i = 0; i < n; i += stride) {
        const v = vals[i];
        if (!Number.isFinite(v)) { pen = false; continue; }
        s += `${pen ? 'L' : 'M'}${x(i * dt).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      }
      return s;
    };
    const ticks: number[] = [];
    for (let v = y0; v <= y1 + step / 2; v += step) ticks.push(Math.round(v / step) * step);
    let limit = '', wash = '';
    if (spec.limit) {
      const L = spec.limit.values;
      limit = typeof L === 'number' ? `M${X0},${y(L).toFixed(1)}L${X1},${y(L).toFixed(1)}` : path(L);
      if (spec.limit.bad !== 'none') {
        const edge = spec.limit.bad === 'above' ? Y0 : Y1;
        if (typeof L === 'number') wash = `M${X0},${y(L)}L${X1},${y(L)}L${X1},${edge}L${X0},${edge}Z`;
        else {
          // from the first to the last sample where the limit exists
          let i0 = -1, i1 = -1;
          for (let i = 0; i < L.length; i++) if (Number.isFinite(L[i])) { if (i0 < 0) i0 = i; i1 = i; }
          if (i0 >= 0) wash = `${path(L)}L${x(i1 * dt).toFixed(1)},${edge}L${x(i0 * dt).toFixed(1)},${edge}Z`;
        }
      }
    }
    return { x, y, ticks, lines: spec.lines.map((l) => ({ ...l, d: path(l.values) })), limit, wash };
  }, [spec, run, T, dt, X1]);

  const pick = (e: MouseEvent<SVGRectElement>): number => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.min(Math.max(((e.clientX - r.left) / r.width) * T, 0), T);
  };
  // time ticks: as many as fit at about 90 px apart
  const nT = Math.max(2, Math.min(6, Math.floor((X1 - X0) / 90)));
  const tickT = Array.from({ length: nT + 1 }, (_, k) => (k / nT) * T);
  const unit = spec.unit ? ` ${spec.unit}` : '';
  const cx = cursorX(X0, X1, now, T).toFixed(1);
  return (
    <figure className="sim-chart">
      <figcaption>
        <span className="title">{spec.title}{spec.unit ? <small> [{spec.unit}]</small> : null}</span>
        {spec.lines.length > 1 || spec.limit ? (
          <span className="legend">
            {spec.lines.map((l) => <span key={l.key}><i className={`key s${l.tone}`} />{l.label}</span>)}
            {spec.limit ? <span><i className={`key limit${spec.limit.bad === 'none' ? ' ref' : ''}`} />{spec.limit.label}</span> : null}
          </span>
        ) : null}
      </figcaption>
      <div className="plot" ref={plot}>
        <svg viewBox={`0 0 ${VW} ${VH}`} width={VW} height={VH} role="img" aria-label={spec.title}>
          {geo.ticks.map((v) => (
            <g key={v}>
              <line className="grid" x1={X0} x2={X1} y1={geo.y(v)} y2={geo.y(v)} />
              <text className="tick" x={X0 - 6} y={geo.y(v) + 4} textAnchor="end">{fmt(v, Math.abs(v) < 10 && spec.dec > 0 ? Math.min(spec.dec, 2) : 0)}</text>
            </g>
          ))}
          {tickT.map((t, k) => <text key={t} className="tick" x={geo.x(t)} y={VH - 8} textAnchor={k === 0 ? 'start' : k === nT ? 'end' : 'middle'}>{fmt(t, 1)} s</text>)}
          <line className="axis" x1={X0} x2={X1} y1={Y1} y2={Y1} />
          {geo.wash ? <path className="wash" d={geo.wash} /> : null}
          {geo.limit ? <path className={`limit${spec.limit?.bad === 'none' ? ' ref' : ''}`} d={geo.limit} /> : null}
          {geo.lines.map((l) => <path key={l.key} className={`line s${l.tone}`} d={l.d} />)}
          <line ref={cursorRef} className="cursor" x1={cx} x2={cx} y1={Y0} y2={Y1} data-x0={X0} data-x1={X1} />
          {hover != null ? <line className="cross" x1={geo.x(hover)} x2={geo.x(hover)} y1={Y0} y2={Y1} /> : null}
          <rect className="hit" x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0}
            onPointerMove={(e) => onHover(pick(e))} onPointerLeave={() => onHover(null)} onClick={(e) => onSeek(pick(e))} />
        </svg>
        {hover != null ? (
          <div className={`tip${hover > T / 2 ? ' flip' : ''}`} style={{ left: `${geo.x(hover)}px` }}>
            {spec.lines.map((l) => (
              <div key={l.key}><strong>{fmt(at(l.values, hover / dt), spec.dec)}{unit}</strong> <i className={`key s${l.tone}`} />{l.label}</div>
            ))}
            {spec.limit ? <div><strong>{fmt(typeof spec.limit.values === 'number' ? spec.limit.values : at(spec.limit.values, hover / dt), spec.dec)}{unit}</strong> {spec.limit.label}</div> : null}
            <div className="when">{timeLabel} {fmt(hover, 2)} s</div>
          </div>
        ) : null}
      </div>
    </figure>
  );
}

export default function SimCharts({ specs, run, clock, fmt, timeLabel }: Props) {
  const T = Math.max((run.series.n - 1) * run.series.dt, 1e-6);
  const cursors = useRef(new Map<string, SVGLineElement>());
  const [hover, setHover] = useState<{ key: string; t: number } | null>(null);
  useEffect(() => {
    let raf = 0;
    const draw = (): void => {
      const t = clock.time();
      for (const el of cursors.current.values()) {
        const x = cursorX(Number(el.dataset.x0), Number(el.dataset.x1), t, T).toFixed(1);
        el.setAttribute('x1', x);
        el.setAttribute('x2', x);
      }
      if (clock.playing) raf = requestAnimationFrame(draw);
    };
    const kick = (): void => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
    kick();
    const off = clock.subscribe(kick);
    return () => { off(); cancelAnimationFrame(raf); };
  }, [clock, T, run]);
  return (
    <div className={`sim-charts n${specs.length}`}>
      {specs.map((s) => (
        <Chart key={s.key} spec={s} run={run} T={T} now={clock.time()} fmt={fmt} timeLabel={timeLabel} hover={hover?.key === s.key ? hover.t : null}
          onHover={(t) => setHover(t == null ? null : { key: s.key, t })} onSeek={(t) => { clock.pause(); clock.seek(t); }}
          cursorRef={(el) => { if (el) cursors.current.set(s.key, el); else cursors.current.delete(s.key); }} />
      ))}
    </div>
  );
}
