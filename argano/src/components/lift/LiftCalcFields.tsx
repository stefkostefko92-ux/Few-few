'use client';

// The installation and the machine in the one form: the calculator's fields (prototype v12, same units and texts),
// but only those a person must enter. The car mass, the rope geometry and the machine are filled in by the software
// unless switched to entered; an automatic value is shown with a badge saying so.
import type { FormValues } from '@/calc/types';
import { BOTTOM_SCHEMES, type AutoFlags, type BottomScheme, type LiftDerived, type LiftInputs } from '@/lib/lift';
import type { Texts } from '@/lib/present/texts';
import type { Pres } from '@/lib/present/tr';
import FieldRow from '../calc/FieldRow';
import { LAYOUT, MACHINE, PLANT, ROPES, SERVICE, shown, type Field } from '../calc/fields';

interface Props {
  P: Pres;
  X: Texts;
  inp: LiftInputs;
  derived: LiftDerived;
  bad: ReadonlySet<string>;
  setCalc(patch: FormValues): void;
  setAuto(patch: Partial<AutoFlags>): void;
  setBottom(b: BottomScheme): void;
  t(key: string, values?: Record<string, string | number>): string;
}

const ALL: readonly Field[] = [...PLANT, ...LAYOUT, ...MACHINE('n_'), ...MACHINE('o_'), ...ROPES('n_'), ...ROPES('o_'), ...SERVICE];
const field = (id: string): Field => {
  const f = ALL.find((x) => x.id === id);
  if (!f) throw new Error(`no field ${id}`);
  return f;
};
/** the group's assumptions, entered also when the machine is proposed */
const ASSUMED = ['n_etaD', 'n_etaI', 'n_poles', 'n_fn', 'n_nm', 'n_Jm', 'n_Js', 'n_mass'] as const;

export default function LiftCalcFields({ P, X, inp, derived, bad, setCalc, setAuto, setBottom, t }: Props) {
  const V: FormValues = { ...inp.calc, layout: derived.values.layout };
  const DV = derived.values, auto = inp.auto, { fmt } = P;
  const set = (id: string, value: string | boolean): void => setCalc({ [id]: value });
  const row = (id: string, a: { value: string; badge: string } | null = null) => <FieldRow key={id} P={P} f={field(id)} V={V} bad={bad} set={set} auto={a} />;
  const toggle = (key: keyof AutoFlags, label: string) => (
    <div className="row check auto-toggle">
      <input type="checkbox" id={`auto-${key}`} checked={auto[key]} onChange={(e) => setAuto({ [key]: e.target.checked })} />
      <label htmlFor={`auto-${key}`}>{label}</label>
    </div>
  );
  const num = (id: string): number => Number(DV[id] ?? 0);
  const pick = derived.analysis.sizing.pick, repl = V.context === 'repl';
  const ropesFromProposal = auto.machine && !(repl && !!V.keepRopes);
  return (
    <div className="calc lift-calc">
      <details className="group" open>
        <summary>{t('g_plant')}</summary>
        <div className="rows">
          {row('r')}
          {row('layout')}
          {derived.bottom ? (
            <>
              <div className="row">
                <label htmlFor="bottom-scheme">{t('bottom_scheme')}</label>
                <select id="bottom-scheme" className="input" value={derived.bottom} onChange={(e) => setBottom(e.target.value as BottomScheme)}>
                  {BOTTOM_SCHEMES.map((b) => <option key={b} value={b}>{t(`bottom_${b}`)}</option>)}
                </select>
              </div>
              <p className="hint">{t('hint_bottom_pulleys', { n: derived.headPulleys, extra: derived.headPulleys - 2 })}</p>
              {derived.bottom === 'under' ? <p className="hint">{t('hint_bottom_under')}</p> : null}
              {derived.bottomGap ? (
                <p className="hint bad" role="alert">{derived.bottomGap.need === null
                  ? t('hint_bottom_gap_none', { now: derived.bottomGap.now })
                  : t('hint_bottom_gap', { now: derived.bottomGap.now, need: derived.bottomGap.need })}</p>
              ) : null}
            </>
          ) : null}
          {toggle('P', t('auto_P'))}
          {row('P', auto.P ? { value: fmt(num('P'), 0), badge: t('badge_estimate') } : null)}
          {auto.P ? <p className="hint">{t('hint_P_estimate')}</p> : null}
          {row('k')}
          {row('qeq')}
        </div>
      </details>
      <details className="group" open>
        <summary>{t('g_machine')}</summary>
        <div className="rows">
          {toggle('machine', t('auto_machine'))}
          {auto.machine ? (
            <>
              <p className="hint">{derived.noProposal ? t('no_proposal') : t('hint_machine_auto')}</p>
              {pick && !derived.noProposal ? <p className="proposal-line num">{X.proposalShort(pick)}</p> : null}
              <div className="subhead">{t('assumptions')}</div>
              {ASSUMED.map((id) => row(id))}
            </>
          ) : MACHINE('n_').map((f) => row(f.id))}
          <div className="subhead">{P.t('g_ropes')}</div>
          <div className="row check" hidden={!shown('keepRopes', V)}>
            <input type="checkbox" id="keepRopes" checked={!!V.keepRopes} onChange={(e) => set('keepRopes', e.target.checked)} />
            <label htmlFor="keepRopes">{P.t('keepRopes')}</label>
          </div>
          {ROPES('n_').map((f) => row(f.id, ropesFromProposal ? { value: fmt(num(f.id), f.id === 'n_qf' ? 3 : f.id === 'n_Fmin' ? 1 : f.id === 'n_d' ? 1 : 0), badge: t('badge_auto') } : null))}
        </div>
      </details>
      {repl ? (
        <details className="group">
          <summary>{P.t('g_old')}</summary>
          <div className="rows">
            <div className="row check">
              <input type="checkbox" id="compare" checked={!!V.compare} onChange={(e) => set('compare', e.target.checked)} />
              <label htmlFor="compare">{P.t('compare')}</label>
            </div>
            <div className="hint">{P.t('hint_old')}</div>
            <div className="row check" hidden={!shown('keepD', V)}>
              <input type="checkbox" id="keepD" checked={!!V.keepD} onChange={(e) => set('keepD', e.target.checked)} />
              <label htmlFor="keepD">{P.t('keepD')}</label>
            </div>
            <div className="subrows" hidden={!V.compare}>
              {MACHINE('o_').map((f) => row(f.id))}
              <div className="subhead">{P.t('oldRopes')}</div>
              {ROPES('o_').map((f) => row(f.id))}
            </div>
          </div>
        </details>
      ) : null}
      <details className="group" open={derived.issues.length > 0 || undefined}>
        <summary>{t('g_geometry')}</summary>
        <div className="rows">
          {row('alphaMode')}
          {row('alphaManual')}
          {row('dropAlign')}
          {toggle('L0', t('auto_L0'))}
          {row('L0', auto.L0 ? { value: fmt(num('L0'), 2), badge: t('badge_auto') } : null)}
          {V.layout === 'topDefl' ? toggle('dx', t('auto_dx')) : null}
          {row('dx', auto.dx ? { value: fmt(num('dx'), 3), badge: t('badge_auto') } : null)}
          {derived.issues.includes('dx') ? <p className="hint bad" role="alert">{t('hint_dx_tight')}</p> : null}
          {row('h')}
          {V.layout === 'bottom' ? toggle('Hv', t('auto_Hv')) : null}
          {row('Hv', auto.Hv ? { value: fmt(num('Hv'), 2), badge: t('badge_auto') } : null)}
          {['Dp', 'Jp', 'nps', 'npr', 'etaShaft'].map((id) => row(id))}
        </div>
      </details>
      <details className="group">
        <summary>{P.t('g_service')}</summary>
        <div className="rows">{SERVICE.map((f) => row(f.id))}</div>
      </details>
    </div>
  );
}
