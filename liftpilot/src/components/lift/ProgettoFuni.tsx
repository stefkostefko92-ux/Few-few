'use client';

// The ropes in the drawing (round 45): what the Progetto completes of its «Calcolo argano» — the scheme of a machine
// below and the switches of the values the drawing gives (the rope beyond the travel, the diverting pulley's distance
// and height, a machine below's pulleys): on, the drawing's value; off, the calculation's as it was saved. The hints
// of the one form follow (a direct pull's falls against the sheave, the refuge, the pulleys of a machine below, a
// distance to measure); the calculation's own fields are not here — they are changed in «Calcolo argano»: an issue the
// calculation resolves (the falls against the sheave, the diverting pulley's distance or height) carries «Porta nel
// calcolo», which opens it with the drawing's values.
import { SHEAVE_GRID } from '@/calc/sizing';
import type { FormValues } from '@/calc/types';
import { BOTTOM_SCHEMES, type BottomScheme, type LiftDerived } from '@/lib/lift';
import type { ProgettoAuto } from '@/lib/lift/progetto';
import type { Pres } from '@/lib/present/tr';
import FieldRow, { type BlankTexts } from '../calc/FieldRow';
import { LAYOUT, PLANT, type Field } from '../calc/fields';
import { fieldId, type FormBlank } from '../blank';

interface Props {
  P: Pres;
  /** the base calculation's values, as saved */
  base: FormValues;
  auto: ProgettoAuto;
  bottom: BottomScheme | undefined;
  /** the diverting pulley's height set on the plan [m] (counts with the switch off) */
  h: number | undefined;
  derived: LiftDerived | null;
  blank: FormBlank;
  texts: BlankTexts;
  setAuto(patch: Partial<ProgettoAuto>): void;
  setBottom(b: BottomScheme): void;
  t(key: string, values?: Record<string, string | number>): string;
  /** «Porta nel calcolo»; null: not for this user */
  porta: { go(): void; pending: boolean; label: string } | null;
  /** the existing falls a direct pull keeps [mm] and the plan's drop set to them (round 46); `kept`: the sheave of the
   *  machine the intervention keeps (its falls are where they hang); null: the plan's falls */
  calate?: { Do: number; fix(): void; kept?: boolean } | null;
  /** the machine the intervention keeps (round 46, B8): L0, dx and h locked to the calculation's (src/lib/lift/kept.ts) */
  kept?: boolean;
}

const field = (id: string): Field => {
  const f = [...PLANT, ...LAYOUT].find((x) => x.id === id);
  if (!f) throw new Error(`no field ${id}`);
  return f;
};
const NONE = new Set<string>();

/** A direct pull: the falls in the plan are the sheave's diameter apart, or why not; on the falls an existing lift keeps
 *  (round 46), the existing sheave's spacing beside the new sheave, and the plan's drop set to them with one click. */
function calataHint(derived: LiftDerived, fmt: Pres['fmt'], t: Props['t'], calate: Props['calate']) {
  const c = derived.calata ?? 0, D = derived.analysis.ctx.N.D, bad = derived.issues.includes('calata');
  if (calate) {
    const v = { c: fmt(c, 0), Do: fmt(calate.Do, 0), D: fmt(D, 0) }, k = calate.kept ? '_kept' : '';
    return (
      <div id="progetto-calata" tabIndex={-1}>
        <p className={bad ? 'hint bad' : 'hint'} role={bad ? 'alert' : undefined}>{t(bad ? `hint_calata_esistenti${k}_bad` : `hint_calata_esistenti${k}`, v)}</p>
        {bad ? <div className="btnrow"><button type="button" className="btn btn-sm calata-esistente" onClick={calate.fix}>{t(`calata_fix${k}`, v)}</button></div> : null}
      </div>
    );
  }
  const out = c < SHEAVE_GRID[0] - 0.5 || c > SHEAVE_GRID[SHEAVE_GRID.length - 1] + 0.5;
  const text = !bad ? t('hint_calata', { c: fmt(c, 0), D: fmt(D, 0) })
    : out ? t('hint_calata_range', { c: fmt(c, 0), min: SHEAVE_GRID[0], max: SHEAVE_GRID[SHEAVE_GRID.length - 1] })
      : t('hint_calata_bad', { c: fmt(c, 0), D: fmt(D, 0) });
  return <p id="progetto-calata" tabIndex={-1} className={bad ? 'hint bad' : 'hint'} role={bad ? 'alert' : undefined}>{text}</p>;
}

/** The margin of the car's and the counterweight's place with the fixed dimensions [mm] when it fails, else null. */
const placeFail = (d: LiftDerived): number | null => {
  const c = d.layout.checks.find((x) => x.id === 'v_place');
  return c && c.status === 'fail' && c.value !== null ? c.value : null;
};

export default function ProgettoFuni({ P, base, auto, bottom, h, derived, blank, texts, setAuto, setBottom, t, porta, calate = null, kept = false }: Props) {
  const { fmt } = P, layout = base.layout, DV = derived?.values ?? base;
  // the issues the calculation resolves: the way to it, beside them
  const toCalc = (on: boolean) => (on && porta ? <div className="btnrow"><button type="button" className="btn btn-sm porta-calcolo" onClick={porta.go} disabled={porta.pending}>{porta.label}</button></div> : null);
  const bottomBlank = blank.is('bottom'), scheme = derived?.bottom ?? bottom ?? 'head';
  // a value of the drawing (switched on: the drawing's, once worked out) or of the calculation (off: as saved); the
  // diverting pulley's height set on the plan, the plan's
  const value = (id: 'L0' | 'dx' | 'h' | 'Hv', on: boolean, dec: number, plan = false) => {
    const x = on || plan ? (derived ? Number(DV[id]) : plan && h !== undefined ? h : null) : Number(base[id]);
    return (
      <FieldRow key={id} P={P} f={field(id)} V={base} bad={NONE} set={() => {}} texts={texts}
        auto={{ value: x === null || !Number.isFinite(x) ? '—' : fmt(x, dec), badge: t(on ? 'badge_auto' : plan ? 'badge_pianta' : 'badge_calcolo') }} />
    );
  };
  // (kept: L0 and dx·h the calculation's, the switch locked off with its reason)
  const locked = (key: 'L0' | 'dx' | 'Hv'): boolean => kept && key !== 'Hv';
  const toggle = (key: 'L0' | 'dx' | 'Hv', label: string) => (
    <div className={`row check auto-toggle${locked(key) ? ' locked' : ''}`}>
      <input type="checkbox" id={`auto-${key}`} checked={locked(key) ? false : auto[key]} disabled={locked(key)} aria-describedby={locked(key) ? 'progetto-kept' : undefined}
        onChange={(e) => setAuto({ [key]: e.target.checked })} />
      <label htmlFor={`auto-${key}`}>{label}</label>
    </div>
  );
  const complete = derived !== null;
  return (
    <div className="calc lift-calc">
      <details className="group" open>
        <summary>{t('g_funi')}</summary>
        <div className="rows">
          <p className="hint">{t('hint_funi')}</p>
          {kept ? <p className="hint" id="progetto-kept">{t('hint_kept_funi')}</p> : null}
          {complete && derived.calata !== null ? calataHint(derived, fmt, t, calate) : null}
          {/* the plan's drop at the existing falls, the car or the counterweight no longer in its place: the software's
              drop, not a dimension fixed by hand (round 46) */}
          {complete && calate && placeFail(derived) !== null ? (
            <p className="hint bad" role="alert">{t('hint_calata_esistenti_place', { Do: fmt(calate.Do, 0), m: fmt(placeFail(derived) ?? 0, 0) })}</p>
          ) : null}
          {toCalc(complete && (derived.issues.includes('calata') || (!!calate && placeFail(derived) !== null)))}
          {layout === 'bottom' ? (
            <>
              <div className={`row wide${bottomBlank ? ' need' : ''}`}>
                <label htmlFor={fieldId('bottom')}>{t('bottom_scheme')}</label>
                <select id={fieldId('bottom')} className="input" value={bottomBlank ? '' : scheme} aria-required={bottomBlank || undefined}
                  onChange={(e) => { const b = BOTTOM_SCHEMES.find((x) => x === e.target.value); if (b) setBottom(b); }}>
                  {bottomBlank ? <option value="" disabled>{texts.choose}</option> : null}
                  {BOTTOM_SCHEMES.map((b) => <option key={b} value={b}>{t(`bottom_${b}`)}</option>)}
                </select>
              </div>
              {complete ? <p className="hint">{t('hint_bottom_pulleys', { n: derived.headPulleys, extra: derived.headPulleys - 2 })}</p> : null}
              {!bottomBlank && scheme === 'under' ? <p className="hint">{t('hint_bottom_under')}</p> : null}
              {complete && derived.bottomGap ? (
                <p className="hint bad" role="alert">{derived.bottomGap.need === null
                  ? t('hint_bottom_gap_none', { now: derived.bottomGap.now })
                  : t('hint_bottom_gap', { now: derived.bottomGap.now, need: derived.bottomGap.need })}</p>
              ) : null}
            </>
          ) : null}
          {complete && derived.refugeHead ? (
            <p className="hint bad" role="alert">{t('hint_refuge_head', { now: derived.refugeHead.now, need: derived.refugeHead.need })}
              {layout === 'bottom' && scheme !== 'room' ? ` ${t('hint_refuge_room')}` : ''}</p>
          ) : null}
          {toggle('L0', t('auto_L0'))}
          {value('L0', auto.L0 && !kept, 2)}
          {complete && derived.issues.includes('L0') && derived.drawn.L0 !== null ? (
            <p className="hint bad" role="alert">{t(kept ? 'hint_L0_kept' : 'hint_L0_drawn', { v: fmt(Number(DV.L0), 2), g: fmt(derived.drawn.L0, 2) })}</p>
          ) : null}
          {toCalc(kept && complete && derived.issues.includes('L0'))}
          {layout === 'topDefl' ? (
            <>
              {toggle('dx', t('auto_dx'))}
              {value('dx', auto.dx && !kept, 3)}
              {complete && derived.issues.includes('dx') ? (
                <p className="hint bad" role="alert">
                  {/* the pulley on its own stand under a machine on the floor: no h fits, the support is the cause */}
                  {t(derived.supportChecks.some((c) => c.id === 'm_stand' && c.status === 'fail') ? 'hint_stand_under' : 'hint_dx_tight')}
                </p>
              ) : null}
              {toCalc(complete && derived.issues.includes('dx'))}
              {value('h', auto.dx && !kept && !!derived?.machine.rinvio, 3, !kept && !auto.dx && h !== undefined)}
              {complete && derived.issues.includes('rinvio') ? <p className="hint bad" role="alert">{t(derived.rinvioClash === 'machine' ? 'hint_rinvio_machine' : 'hint_rinvio_floor')}</p> : null}
              {toCalc(complete && derived.issues.includes('rinvio'))}
            </>
          ) : null}
          {layout === 'bottom' ? (
            <>
              {toggle('Hv', t('auto_Hv'))}
              {value('Hv', auto.Hv, 2)}
              {complete && derived.issues.includes('Hv') && derived.drawn.Hv !== null ? (
                <p className="hint bad" role="alert">{t('hint_Hv_drawn', { v: fmt(Number(DV.Hv), 2), g: fmt(derived.drawn.Hv, 2) })}</p>
              ) : null}
            </>
          ) : null}
        </div>
      </details>
    </div>
  );
}
