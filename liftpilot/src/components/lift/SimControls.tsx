'use client';

// Controls of the simulator: the scenario, its parameters (floors and load, the braking case, the buffer), the
// transport (play, pause, restart, speed) and the time slider. The slider and the time follow the clock without
// re-rendering React on every frame. Round 52: each parameter, the playback speed and the time with their «?». Round 53:
// each scenario says in a line what it shows.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../../messages/aiuto/progetto.json';
import { brakeParams, type ScenarioParams } from '@/sim';
import Icon, { type IconName } from '@/components/Icon';
import Etichetta from '../aiuto/Etichetta';
import Campo, { ConAiuto } from '../shaft/Campo';
import type { SimClock } from './clock';
import { SCENARIOS, type ScenarioKey } from './scenarios';

/** the painted icon of each scenario's tab */
const SC_ICON: Record<ScenarioKey, IconName> = { ride: 'elevator', brake: 'brake', loading: 'weight', stall: 'lock', buffer: 'arrow-down-to-line' };

interface Props {
  sc: ScenarioParams;
  choose(id: ScenarioKey): void;
  set(next: ScenarioParams, play: boolean): void;
  labels: readonly string[];
  /** floor nearest the car now */
  here(): number;
  Q: number;
  /** duration of the run [s] */
  T: number;
  clock: SimClock;
  fmt(x: number, dec?: number): string;
}

function Seg<T extends string>({ label, value, options, onChange, aiuto }: {
  label: string; value: T; options: readonly { v: T; label: string }[]; onChange(v: T): void; aiuto: string | null;
}) {
  return (
    <div className="sim-seg">
      <div className="seg-row" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={value === o.v} className={value === o.v ? 'on' : undefined} onClick={() => onChange(o.v)}>{o.label}</button>
        ))}
      </div>
      <ConAiuto aiuto={aiuto} nome={label} />
    </div>
  );
}

export default function SimControls({ sc, choose, set, labels, here, Q, T, clock, fmt }: Props) {
  const t = useTranslations('lift');
  const playing = useSyncExternalStore(clock.subscribe, () => clock.playing, () => false);
  const speed = useSyncExternalStore(clock.subscribe, () => clock.speed, () => 1);
  const slider = useRef<HTMLInputElement>(null), clockText = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = (): void => {
      const now = clock.time();
      if (slider.current) slider.current.value = String(now);
      if (clockText.current) clockText.current.textContent = `${fmt(now, 1)} / ${fmt(T, 1)} s`;
      if (clock.playing) raf = requestAnimationFrame(draw);
    };
    const kick = (): void => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
    kick();
    const off = clock.subscribe(kick);
    return () => { off(); cancelAnimationFrame(raf); };
  }, [clock, T, fmt]);

  return (
    <div className="sim-controls">
      <div className="scenario-tabs" role="tablist" aria-label={t('scenario')}>
        {SCENARIOS.map((id) => (
          <button key={id} type="button" role="tab" data-scenario={id} aria-selected={sc.id === id} className={sc.id === id ? 'on' : undefined} onClick={() => choose(id)}>
            <Icon name={SC_ICON[id]} size={18} /><span className="sc-text"><span className="sc-name">{t(`sc_${id}`)}</span><span className="sc-d">{t(`sc_${id}_d`)}</span></span>
          </button>
        ))}
      </div>
      <div className="scenario-params">
        {sc.id === 'ride' ? (
          <>
            <div className="field">
              <ConAiuto aiuto={testoAiuto(AIUTO, 'sim_call')} nome={t('call')}>{t('call')}</ConAiuto>
              <div className="floor-buttons">
                {labels.map((l, i) => (
                  <button key={`${l}-${i}`} type="button" className={sc.p.to === i ? 'on' : undefined} onClick={() => set({ id: 'ride', p: { from: here(), to: i, load: sc.p.load } }, true)}>{l}</button>
                ))}
              </div>
            </div>
            <Campo id="sim-load" nome={t('load')} aiuto={testoAiuto(AIUTO, 'sim_load')} label={<>{t('load')}: <strong className="num">{fmt(sc.p.load, 0)} kg</strong></>}>
              <input id="sim-load" type="range" min={0} max={Q} step={Math.max(5, Math.round(Q / 40))} value={sc.p.load}
                onChange={(e) => set({ id: 'ride', p: { ...sc.p, from: here(), to: sc.p.to, load: Number(e.target.value) } }, false)} />
            </Campo>
          </>
        ) : null}
        {sc.id === 'brake' ? (
          <>
            {/* the acceptance test's 1,25·Q moves down with the real brake (brakeParams keeps any other choice consistent) */}
            <Seg label={t('load')} aiuto={testoAiuto(AIUTO, 'sim_brakeLoad')} value={sc.p.load} onChange={(load) => set({ id: 'brake', p: load === 'q125' ? { ...sc.p, load, dir: 'dn', decel: 'real' } : { ...sc.p, load } }, true)}
              options={[{ v: 'q', label: t('loadQ') }, { v: 'e', label: t('loadEmpty') }, { v: 'q125', label: t('loadTest') }]} />
            <Seg label={t('direction')} aiuto={testoAiuto(AIUTO, 'sim_direction')} value={sc.p.dir} onChange={(dir) => set({ id: 'brake', p: brakeParams({ ...sc.p, dir }) }, true)}
              options={[{ v: 'dn', label: t('dir_dn') }, { v: 'up', label: t('dir_up') }]} />
            <Seg label={t('decel')} aiuto={testoAiuto(AIUTO, 'sim_decel')} value={sc.p.decel} onChange={(decel) => set({ id: 'brake', p: brakeParams({ ...sc.p, decel }) }, true)}
              options={[{ v: 'real', label: t('decel_real') }, { v: 'norm', label: t('decel_norm') }]} />
          </>
        ) : null}
        {sc.id === 'buffer' ? (
          <Seg label={t('side')} aiuto={testoAiuto(AIUTO, 'sim_side')} value={sc.p.side} onChange={(side) => set({ id: 'buffer', p: { side } }, true)}
            options={[{ v: 'car', label: t('side_car') }, { v: 'cw', label: t('side_cw') }]} />
        ) : null}
        {sc.id === 'loading' || sc.id === 'stall' ? <p className="note">{t(`about_${sc.id}`)}</p> : null}
      </div>
      <div className="transport">
        <button type="button" className="btn btn-primary play" onClick={() => (playing ? clock.pause() : clock.play())} aria-pressed={playing}>
          {playing ? `❚❚ ${t('pause')}` : `▶ ${t('play')}`}
        </button>
        <button type="button" className="btn" onClick={() => { clock.seek(0); clock.play(); }}>⟲ {t('restart')}</button>
        <span className="speed">
          <Etichetta htmlFor="sim-speed" aiuto={testoAiuto(AIUTO, 'sim_speed')} nome={t('speed')}>{t('speed')}</Etichetta>
          <select id="sim-speed" className="input" value={speed} onChange={(e) => clock.setSpeed(Number(e.target.value))}>
            {[0.25, 0.5, 1, 2].map((k) => <option key={k} value={k}>×{fmt(k, k < 1 ? 2 : 0)}</option>)}
          </select>
        </span>
        <input ref={slider} className="time" type="range" min={0} max={T} step={0.02} defaultValue={0} aria-label={t('time')}
          onChange={(e) => { clock.pause(); clock.seek(Number(e.target.value)); }} />
        <ConAiuto aiuto={testoAiuto(AIUTO, 'sim_time')} nome={t('time')} />
        <output ref={clockText} className="num clock" />
      </div>
    </div>
  );
}
