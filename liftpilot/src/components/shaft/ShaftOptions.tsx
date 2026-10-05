'use client';

// The shaft's data of a design: rated load (the largest car, or a given load), entrances and the second one's side,
// doors, the counterweight's side, the walls and the accessibility. A new installation starts with each to enter
// (src/lib/lift/blank.ts): nothing chosen, nothing written. The software's own choices (ShaftTechOptions) come once
// the project's data are in.
import { useTranslations } from 'next-intl';
import { counterweightSide, type ShaftInputs } from '@/shaft';
import { entrancesTo, filled, type BlankKey } from '@/lib/lift/blank';
import { NO_BLANK, fieldId, mmOf, type FormBlank, type ShaftSet } from '../blank';
import Seg from './Seg';

interface Props {
  I: ShaftInputs;
  set: ShaftSet;
  /** kg used when switching to a given load */
  lastQ: number;
  blank?: FormBlank;
}

const ACCESS = ['none', 'dm236_existing', 'dm236_residential', 'dm236_public'] as const;

export default function ShaftOptions({ I, set, lastQ, blank = NO_BLANK }: Props) {
  const t = useTranslations('shaft'), tb = useTranslations('blank'), is = blank.is;
  const need = (k: BlankKey): string => (is(k) ? ' need' : '');
  const num = (key: 'doorWidth' | 'doorHeight' | 'wall', min: number, max: number, step = 10) => (
    <label className={`field${need(key)}`}>
      <span>{t(key)}</span>
      <input id={fieldId(key)} className="input num" type="number" inputMode="numeric" min={min} max={max} step={step} value={is(key) ? '' : I[key]}
        aria-required={is(key) || undefined} onChange={(e) => { const v = mmOf(e.target.value); if (v !== null) set({ [key]: v }); }} />
    </label>
  );
  const one = is('entrances') || I.entrances === 'one';
  return (
    <div className="shaft-options">
      <Seg name="qmode" id={fieldId('Q')} need={is('Q')} label={t('Qmode')} value={is('Q') ? null : I.Q === null ? 'max' : 'given'}
        onChange={(v) => set({ Q: v === 'max' ? null : lastQ })} options={[{ v: 'max', label: t('Qmax') }, { v: 'given', label: t('Qgiven') }]} />
      {!is('Q') && I.Q !== null ? (
        <label className={`field${need('Qkg')}`}>
          <span>{t('Q')}</span>
          <input id={fieldId('Qkg')} className="input num" type="number" inputMode="numeric" min={100} max={10000} step={5} value={is('Qkg') ? '' : I.Q}
            aria-required={is('Qkg') || undefined} onChange={(e) => { const v = mmOf(e.target.value); if (v !== null) set({ Q: v }, (b) => filled(b, ['Qkg'])); }} />
        </label>
      ) : null}
      <Seg name="entrances" id={fieldId('entrances')} need={is('entrances')} label={t('entrances')} value={is('entrances') ? null : I.entrances}
        onChange={(entrances) => set({ entrances }, (b) => entrancesTo(I, b, entrances))}
        options={[{ v: 'one', label: t('ent_one') }, { v: 'opposite', label: t('ent_opposite') }, { v: 'adjacent', label: t('ent_adjacent') }]} />
      {!is('entrances') && I.entrances === 'adjacent'
        ? <Seg name="side2" id={fieldId('side2')} need={is('side2')} label={t('side2')} value={is('side2') ? null : I.side2} onChange={(side2) => set({ side2 })}
            options={[{ v: 'left', label: t('side_left') }, { v: 'right', label: t('side_right') }]} />
        : null}
      <Seg name="door" id={fieldId('door')} need={is('door')} label={t('door')} value={is('door') ? null : I.door} onChange={(door) => set({ door })}
        options={[{ v: 'T2', label: t('T2') }, { v: 'C2', label: t('C2') }]} />
      <div className="form-grid">
        {num('doorWidth', 500, 2500, 50)}
        {num('doorHeight', 1800, 3000, 50)}
      </div>
      {one
        ? <Seg name="cw" id={fieldId('cw')} need={is('cw')} label={t('cw')} value={is('cw') ? null : I.cw} onChange={(cw) => set({ cw })}
            options={[{ v: 'rear', label: t('cw_rear') }, { v: 'left', label: t('cw_left') }, { v: 'right', label: t('cw_right') }]} />
        : <p className="note">{t('cwForced', { side: t(`cw_${counterweightSide(I)}`).toLowerCase() })}</p>}
      <div className="form-grid">
        {num('wall', 50, 1000, 10)}
        <label className={`field${need('access')}`}>
          <span>{t('access')}</span>
          <select id={fieldId('access')} className="input" value={is('access') ? '' : I.access} aria-required={is('access') || undefined}
            onChange={(e) => { const a = ACCESS.find((x) => x === e.target.value); if (a) set({ access: a }); }}>
            {is('access') ? <option value="" disabled>{tb('choose')}</option> : null}
            {ACCESS.map((a) => <option key={a} value={a}>{t(`access_${a}`)}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
