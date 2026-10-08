'use client';

// The installation and the machine in the one form: the calculator's fields (prototype v12, same units and texts),
// but only those a person must enter. The car mass, the rope geometry and the machine are filled in by the software
// unless switched to entered; an automatic value is shown with a badge saying so, a standard one of the software with
// its own. While the project's data are still to enter only the roping, the machine's place (and the scheme of a
// machine below) are asked, with the existing installation of a replacement: the rest comes once they are in.
import { SHEAVE_GRID } from '@/calc/sizing';
import type { FormValues } from '@/calc/types';
import { BOTTOM_SCHEMES, type AutoFlags, type BottomScheme, type LiftDerived, type LiftInputs } from '@/lib/lift';
import { isLiftStandard } from '@/lib/lift/defaults';
import { BRANDS, catalogOf, type Brand } from '@/lib/catalog/machines';
import type { CatalogChoice } from '@/lib/lift/catalog';
import type { Texts } from '@/lib/present/texts';
import type { Pres } from '@/lib/present/tr';
import FieldRow, { type BlankTexts } from '../calc/FieldRow';
import { LAYOUT, MACHINE, PLANT, ROPES, SERVICE, shown, type Field } from '../calc/fields';
import { fieldId, type FormBlank } from '../blank';

interface Props {
  P: Pres;
  X: Texts;
  inp: LiftInputs;
  /** what the software worked out; null while the project's data are still to enter */
  derived: LiftDerived | null;
  /** the new machine is in too: what depends on it (its sheave, the rope geometry it gives) is shown */
  complete: boolean;
  bad: ReadonlySet<string>;
  /** the calculation's values still to enter (the roping, the machine's place, an existing installation's values) */
  need: ReadonlySet<string>;
  blank: FormBlank;
  texts: BlankTexts;
  setCalc(patch: FormValues): void;
  setAuto(patch: Partial<AutoFlags>): void;
  setBottom(b: BottomScheme): void;
  setCatalog(c: CatalogChoice | undefined): void;
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

/** A direct pull: the falls in the plan are the sheave's diameter apart (the existing sheave's when it is compared), or
 *  why not — beyond the calculation's sheaves, or another sheave than the plan's. */
function calataHint(derived: LiftDerived, fmt: Pres['fmt'], t: Props['t']) {
  const { I, N, O, compare } = derived.analysis.ctx, c = derived.calata ?? 0, D = compare && I.context === 'repl' ? O.D : N.D;
  const bad = derived.issues.includes('calata'), out = c < SHEAVE_GRID[0] - 0.5 || c > SHEAVE_GRID[SHEAVE_GRID.length - 1] + 0.5;
  const text = !bad ? t('hint_calata', { c: fmt(c, 0), D: fmt(D, 0) })
    : out ? t('hint_calata_range', { c: fmt(c, 0), min: SHEAVE_GRID[0], max: SHEAVE_GRID[SHEAVE_GRID.length - 1] })
      : t('hint_calata_bad', { c: fmt(c, 0), D: fmt(D, 0) });
  return <p className={bad ? 'hint bad' : 'hint'} role={bad ? 'alert' : undefined}>{text}</p>;
}

export default function LiftCalcFields({ P, X, inp, derived, complete, bad, need, blank, texts, setCalc, setAuto, setBottom, setCatalog, t }: Props) {
  const V: FormValues = { ...inp.calc, ...(blank.is('r') ? { r: '' } : {}), ...(blank.is('layout') ? { layout: '' } : {}) };
  const DV = derived?.values ?? V, auto = inp.auto, { fmt } = P;
  const set = (id: string, value: string | boolean): void => setCalc({ [id]: value });
  const row = (id: string, a: { value: string; badge: string } | null = null) => (
    <FieldRow key={id} P={P} f={field(id)} V={V} bad={bad} set={set} auto={a} need={need.has(id)} std={!a && isLiftStandard(V, id)} texts={texts} />
  );
  const toggle = (key: keyof AutoFlags, label: string) => (
    <div className="row check auto-toggle">
      <input type="checkbox" id={`auto-${key}`} checked={auto[key]} onChange={(e) => setAuto({ [key]: e.target.checked })} />
      <label htmlFor={`auto-${key}`}>{label}</label>
    </div>
  );
  const num = (id: string): number => Number(DV[id] ?? 0);
  // a value the software works out with the machine: none shown until the machine is in
  const worked = (text: string): string => (complete ? text : '—');
  const pick = derived?.analysis.sizing.pick ?? null, repl = V.context === 'repl', keep = repl && !!V.keepRopes;
  const ropesFromProposal = !!derived && auto.machine && !derived.noProposal && !keep;
  const bottomBlank = blank.is('bottom'), scheme = derived?.bottom ?? inp.bottom ?? 'head';
  // the ropes: kept from the existing ones in a replacement (to enter), else the proposal's once there is one
  const ropes = (
    <>
      <div className="subhead">{P.t('g_ropes')}</div>
      <div className="row check" hidden={!shown('keepRopes', V)}>
        <input type="checkbox" id="keepRopes" checked={!!V.keepRopes} onChange={(e) => set('keepRopes', e.target.checked)} />
        <label htmlFor="keepRopes">{P.t('keepRopes')}</label>
      </div>
      {derived || keep ? ROPES('n_').map((f) => row(f.id, ropesFromProposal ? { value: fmt(num(f.id), f.id === 'n_qf' ? 3 : f.id === 'n_Fmin' ? 1 : f.id === 'n_d' ? 1 : 0), badge: t('badge_auto') } : null)) : null}
    </>
  );
  return (
    <div className="calc lift-calc">
      <details className="group" open>
        <summary>{t('g_plant')}</summary>
        <div className="rows">
          {row('r')}
          {row('layout')}
          {derived && complete && derived.calata !== null ? calataHint(derived, fmt, t) : null}
          {V.layout === 'bottom' ? (
            <>
              <div className={`row wide${bottomBlank ? ' need' : ''}`}>
                <label htmlFor={fieldId('bottom')}>{t('bottom_scheme')}</label>
                <select id={fieldId('bottom')} className="input" value={bottomBlank ? '' : scheme} aria-required={bottomBlank || undefined}
                  onChange={(e) => { const b = BOTTOM_SCHEMES.find((x) => x === e.target.value); if (b) setBottom(b); }}>
                  {bottomBlank ? <option value="" disabled>{texts.choose}</option> : null}
                  {BOTTOM_SCHEMES.map((b) => <option key={b} value={b}>{t(`bottom_${b}`)}</option>)}
                </select>
              </div>
              {derived && complete ? <p className="hint">{t('hint_bottom_pulleys', { n: derived.headPulleys, extra: derived.headPulleys - 2 })}</p> : null}
              {!bottomBlank && scheme === 'under' ? <p className="hint">{t('hint_bottom_under')}</p> : null}
              {complete && derived?.bottomGap ? (
                <p className="hint bad" role="alert">{derived.bottomGap.need === null
                  ? t('hint_bottom_gap_none', { now: derived.bottomGap.now })
                  : t('hint_bottom_gap', { now: derived.bottomGap.now, need: derived.bottomGap.need })}</p>
              ) : null}
            </>
          ) : null}
          {derived ? (
            <>
              {toggle('P', t('auto_P'))}
              {row('P', auto.P ? { value: fmt(num('P'), 0), badge: t('badge_estimate') } : null)}
              {auto.P ? <p className="hint">{t('hint_P_estimate')}</p> : null}
              {row('k')}
              {row('qeq')}
            </>
          ) : null}
        </div>
      </details>
      {derived ? (
        <details className="group" open>
          <summary>{t('g_machine')}</summary>
          <div className="rows">
            {toggle('machine', t('auto_machine'))}
            {auto.machine ? (
              <>
                <div className="row wide">
                  <label htmlFor="cat-brand">{t('cat_brand')}</label>
                  <select id="cat-brand" className="input" value={inp.catalog?.brand ?? ''}
                    onChange={(e) => setCatalog(e.target.value ? { brand: e.target.value as Brand } : undefined)}>
                    <option value="">{t('cat_grid')}</option>
                    {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                {inp.catalog ? (
                  <div className="row wide">
                    <label htmlFor="cat-model">{t('cat_model')}</label>
                    <select id="cat-model" className="input" value={inp.catalog.model ?? ''}
                      onChange={(e) => setCatalog({ brand: inp.catalog?.brand ?? 'SICOR', ...(e.target.value ? { model: e.target.value } : {}) })}>
                      <option value="">{t('cat_any')}</option>
                      {catalogOf(inp.catalog.brand).map((c) => <option key={c.model} value={c.model}>{c.model}</option>)}
                    </select>
                  </div>
                ) : null}
                {derived.catalog?.fit ? (
                  <p className="hint">{t('cat_fit', {
                    model: `${derived.catalog.fit.machine.brand} ${derived.catalog.fit.machine.model}`, ratio: derived.catalog.fit.ratio ?? '',
                    stat: fmt(derived.catalog.fit.machine.staticKg, 0), dv: `${derived.catalog.fit.dv >= 0 ? '+' : ''}${fmt(derived.catalog.fit.dv * 100, 1)}`,
                  })}</p>
                ) : null}
                {derived.catalog?.miss ? <p className="hint bad" role="alert">{t('cat_miss', { brand: inp.catalog?.model ? `${inp.catalog.brand} ${inp.catalog.model}` : inp.catalog?.brand ?? '' })}</p> : null}
                <p className="hint">{derived.noProposal ? t('no_proposal') : t('hint_machine_auto')}</p>
                {pick && !derived.noProposal ? <p className="proposal-line num">{X.proposalShort(pick)}</p> : null}
              </>
            ) : null}
            {/* without a proposal the machine to check is entered, as with the switch off */}
            {auto.machine && !derived.noProposal ? <><div className="subhead">{t('assumptions')}</div>{ASSUMED.map((id) => row(id))}</> : MACHINE('n_').map((f) => row(f.id))}
            {ropes}
          </div>
        </details>
      ) : repl ? (
        <details className="group" open>
          <summary>{t('g_machine')}</summary>
          <div className="rows">{ropes}</div>
        </details>
      ) : null}
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
      {derived ? (
        <>
          <details className="group" open={(complete && derived.issues.length > 0) || undefined}>
            <summary>{t('g_geometry')}</summary>
            <div className="rows">
              {row('alphaMode')}
              {row('alphaManual')}
              {row('dropAlign')}
              {toggle('L0', t('auto_L0'))}
              {row('L0', auto.L0 ? { value: worked(fmt(num('L0'), 2)), badge: t('badge_auto') } : null)}
              {V.layout === 'topDefl' ? toggle('dx', t('auto_dx')) : null}
              {row('dx', auto.dx ? { value: worked(fmt(num('dx'), 3)), badge: t('badge_auto') } : null)}
              {complete && derived.issues.includes('dx') ? (
                <p className="hint bad" role="alert">
                  {/* the pulley on its own stand under a machine on the floor: no h fits, the support is the cause */}
                  {t(derived.supportChecks.some((c) => c.id === 'm_stand' && c.status === 'fail') ? 'hint_stand_under' : 'hint_dx_tight')}
                </p>
              ) : null}
              {row('h', auto.dx && derived.machine.rinvio ? { value: worked(fmt(num('h'), 3)), badge: t('badge_auto') } : null)}
              {complete && derived.issues.includes('rinvio') ? <p className="hint bad" role="alert">{t('hint_rinvio_floor')}</p> : null}
              {V.layout === 'bottom' ? toggle('Hv', t('auto_Hv')) : null}
              {row('Hv', auto.Hv ? { value: worked(fmt(num('Hv'), 2)), badge: t('badge_auto') } : null)}
              {['Dp', 'Jp', 'nps', 'npr', 'etaShaft'].map((id) => row(id))}
            </div>
          </details>
          <details className="group">
            <summary>{P.t('g_service')}</summary>
            <div className="rows">{SERVICE.map((f) => row(f.id))}</div>
          </details>
        </>
      ) : null}
    </div>
  );
}
