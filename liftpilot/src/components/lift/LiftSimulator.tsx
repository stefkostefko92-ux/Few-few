'use client';

// The simulator of an installation: the 3D stage with its views and a live readout, the controls, the result of the
// run in words and numbers, and the charts on one time axis. Runs are computed here from the derived design
// (src/sim); a check of the list can ask for its run (request).
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { useTranslations } from 'next-intl';
import type { LiftDerived } from '@/lib/lift';
import { duration, runScenario, type ScenarioParams, type SimRun } from '@/sim';
import type { View } from '../lift3d/boot';
import { createClock } from './clock';
import { chartsFor } from './charts';
import { defaultScenario, viewFor, type ScenarioKey } from './scenarios';
import LiftStage from './LiftStage';
import SimControls from './SimControls';
import SimCharts from './SimCharts';

export interface SimRequest {
  sc: ScenarioParams;
  view: View;
  zones?: boolean;
}

/** What the page around the simulator can ask of it: replay a run (a check of the list). */
export interface SimApi {
  play(req: SimRequest): void;
}

interface Props {
  derived: LiftDerived;
  fmt(x: number, dec?: number): string;
  api?: Ref<SimApi>;
}

const lastAtOrBelow = (levels: readonly number[], s: number): number => {
  let k = 0;
  levels.forEach((z, i) => { if (z <= s) k = i; });
  return k;
};

const VIEWS: readonly View[] = ['car', 'shaft', 'room', 'pit'];

function summary(run: SimRun, t: ReturnType<typeof useTranslations<'lift'>>, fmt: Props['fmt'], labels: readonly string[]): string {
  const s = run.summary, sc = run.scenario;
  if (sc.id === 'ride') return t(s.util > 1 ? 'sum_ride_over' : 'sum_ride', { from: labels[sc.p.from] ?? '', to: labels[sc.p.to] ?? '', load: fmt(sc.p.load, 0), util: fmt(s.util, 3), torque: fmt(s.torque, 0) });
  if (sc.id === 'brake') {
    if (s.brakeOwn != null && s.brakeOwn <= 0) return t('sum_brake_none', { tb: fmt(s.torque, 0) });
    const base = { a: fmt(s.accel, 2), util: fmt(s.util, 2), d0: fmt((s.stopDistance ?? 0) * 100, 0) };
    // the brake alone is weaker than the standard's minimum, which the verification uses
    const min = s.brakeOwn != null && s.brakeOwn < s.accel - 1e-9 ? ` ${t('sum_brake_min', { a0: fmt(s.brakeOwn, 2), a: base.a })}` : '';
    const d1 = s.slipDistance ?? 0;
    if (s.slip) return (Number.isFinite(d1) ? t('sum_brake_slip', { ...base, d1: fmt(d1 * 100, 0) }) : t('sum_brake_runaway', base)) + min;
    return t('sum_brake_ok', base) + min;
  }
  if (sc.id === 'loading') return t(run.verdict === 'fail' ? 'sum_loading_fail' : 'sum_loading_ok', { util: fmt(s.util, 3) });
  if (sc.id === 'stall') return t(run.verdict === 'ok' ? 'sum_stall_ok' : 'sum_stall_fail', { ratio: fmt(s.ratio, 2), efa: fmt(s.efa, 2) });
  const x = fmt((s.compression ?? 0) * 1000, 0), stroke = fmt((s.stroke ?? 0) * 1000, 0);
  return run.verdict === 'ok' ? t('sum_buffer_ok', { x, stroke, g: fmt(s.accel / 9.81, 2) }) : t('sum_buffer_fail', { stroke });
}

export default function LiftSimulator({ derived, fmt, api }: Props) {
  const t = useTranslations('lift');
  const m = derived.sim, main = derived.shaft.vertical.main, above = derived.analysis.ctx.I.layout !== 'bottom';
  const [clock] = useState(createClock);
  const [sc, setSc] = useState<ScenarioParams>(() => defaultScenario('ride', m, main));
  const [view, setView] = useState<View>('car');
  const [zones, setZones] = useState(false);
  const autoplay = useRef(false), section = useRef<HTMLElement>(null);
  const run = useMemo(() => runScenario(m, sc), [m, sc]);
  useEffect(() => {
    clock.setRun(run, autoplay.current);
    autoplay.current = false;
  }, [clock, run]);
  useImperativeHandle(api, () => ({
    play(req) {
      autoplay.current = true;
      setSc(req.sc);
      setView(req.view);
      if (req.zones != null) setZones(req.zones);
      // a check far down the list: the replay is up on the stage
      section.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    },
  }), []);

  const set = (next: ScenarioParams, play: boolean): void => {
    autoplay.current = play;
    setSc(next);
  };
  const choose = (id: ScenarioKey): void => {
    const next = defaultScenario(id, m, main);
    setView(viewFor(next, above));
    set(next, true);
  };
  const here = (): number => {
    const s = clock.frame()?.s ?? 0;
    let best = 0;
    m.levels.forEach((z, i) => { if (Math.abs(z - s) < Math.abs(m.levels[best] - s)) best = i; });
    return best;
  };

  // live readout over the stage
  const hud = useRef<HTMLDListElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = (): void => {
      const f = clock.frame(), el = hud.current;
      if (f && el) {
        const i = here(), at = Math.abs(m.levels[i] - f.s) < 0.01;
        const put = (k: string, v: string): void => { const n = el.querySelector(`[data-k="${k}"]`); if (n) n.textContent = v; };
        const lo = lastAtOrBelow(m.levels, f.s), top = m.levels.length - 1;
        put('floor', at ? (m.labels[i] ?? '') : f.s > m.levels[top] ? t('hud_above', { a: m.labels[top] ?? '' })
          : f.s < m.levels[0] ? t('hud_below', { a: m.labels[0] ?? '' }) : t('hud_between', { a: m.labels[lo] ?? '', b: m.labels[lo + 1] ?? '' }));
        put('speed', `${fmt(Math.abs(f.v), 2)} m/s ${f.v > 0.005 ? '▲' : f.v < -0.005 ? '▼' : ''}`);
        put('ratio', Number.isFinite(f.ratio) ? `${fmt(f.ratio, 2)} / ${fmt(f.efa, 2)}` : '—');
        put('load', `${fmt(f.load, 0)} kg`);
        // a slip is the expected outcome with the car stalled, an advice with the brake's own deceleration (unless the car
        // does not stop), a failure otherwise
        el.dataset.slip = f.slip > 0 ? (sc.id === 'stall' ? 'ok' : sc.id === 'brake' && sc.p.decel === 'real' && run.verdict !== 'fail' ? 'warn' : 'fail') : '';
        // the brake holding a car at rest is the normal state: flagged only while it stops a moving car
        el.dataset.brake = f.brake > 0 && Math.abs(f.v) > 0.005 ? '1' : '0';
      }
      if (clock.playing) raf = requestAnimationFrame(draw);
    };
    const kick = (): void => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
    kick();
    const off = clock.subscribe(kick);
    return () => { off(); cancelAnimationFrame(raf); };
  });

  const specs = useMemo(() => chartsFor(run, (k) => t(k), m.phys.model.R, m.I.r, m.phys.Mn, m.I.Q), [run, t, m]);
  return (
    <section ref={section} className="lift-sim" aria-label={t('sim_title')}>
      <div className="stage-wrap">
        <LiftStage derived={derived} clock={clock} view={view} zones={zones} label={t('stage_label')} texts={{ loading: t('loading3d'), failed: t('no3d') }} />
        <dl ref={hud} className="hud" aria-live="off">
          <div><dt>{t('hud_floor')}</dt><dd data-k="floor" /></div>
          <div><dt>{t('hud_speed')}</dt><dd data-k="speed" className="num" /></div>
          <div><dt>{t('hud_ratio')}</dt><dd data-k="ratio" className="num" /></div>
          <div><dt>{t('hud_load')}</dt><dd data-k="load" className="num" /></div>
          <div className="flag slip">{t('hud_slip')}</div>
          <div className="flag brake">{t('hud_brake')}</div>
        </dl>
        <div className="views" role="radiogroup" aria-label={t('views')}>
          {VIEWS.map((v) => <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'on' : undefined} onClick={() => setView(v)}>{t(`view_${v}`)}</button>)}
          <label className="check"><input type="checkbox" checked={zones} onChange={(e) => setZones(e.target.checked)} /> {t('zones')}</label>
        </div>
      </div>
      <SimControls sc={sc} choose={choose} set={set} labels={m.labels} here={here} Q={m.I.Q} T={duration(run.series)} clock={clock} fmt={fmt} />
      <div className={`sim-result ${run.verdict}`} role="status">
        <span className={`status-pill ${run.verdict}`}>{t(`verdict_${run.verdict}`)}</span>
        <p>{summary(run, t, fmt, m.labels)}</p>
      </div>
      <SimCharts specs={specs} run={run} clock={clock} fmt={fmt} timeLabel={t('time')} />
    </section>
  );
}
