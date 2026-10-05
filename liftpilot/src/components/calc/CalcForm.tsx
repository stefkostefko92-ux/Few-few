// Input form of the prototype v12 (buildForm): installation, layout, existing machine, new machine, ropes,
// service. Values are kept as typed (strings); the engine parses them. A value still to enter is marked as needed, a
// standard value of the software carries its badge (src/lib/calc-blank.ts).
import type { FormValues } from '@/calc/types';
import type { CalcKey, Pres } from '@/lib/present/tr';
import { isStandard } from '@/lib/calc-blank';
import { LAYOUT, MACHINE, PLANT, ROPES, SERVICE, shown, type Field } from './fields';
import FieldRow, { type BlankTexts } from './FieldRow';

export type Prefix = 'n_' | 'o_';

interface Props {
  P: Pres;
  V: FormValues;
  bad: ReadonlySet<string>;
  set: (id: string, value: string | boolean) => void;
  onEstimate: (p: Prefix) => void;
  estMsg: Partial<Record<Prefix, string>>;
  keepRopesHint: string;
  /** the values still to enter */
  need: ReadonlySet<string>;
  texts: BlankTexts;
}

export default function CalcForm({ P, V, bad, set, onEstimate, estMsg, keepRopesHint, need, texts }: Props) {
  const { t } = P;
  const row = (f: Field) => <FieldRow key={f.id} P={P} f={f} V={V} bad={bad} set={set} need={need.has(f.id)} std={isStandard(V, f.id)} texts={texts} />;
  const rows = (fields: readonly Field[]) => fields.map(row);
  // the expert rows at the software's standard value, named in the simple mode where they are not shown
  const expert = [...PLANT, ...LAYOUT, ...MACHINE('n_'), ...(V.compare ? MACHINE('o_') : []), ...SERVICE]
    .filter((f) => (f.adv || SERVICE.includes(f)) && f.kind === 'num' && shown(f.id, V) && isStandard(V, f.id));
  const stdNote = texts.stdInUse && expert.length
    ? texts.stdInUse(expert.map((f) => `${t((f.key ?? f.id) as CalcKey)}${f.id.startsWith('o_') ? ` (${t('g_old')})` : ''} ${String(V[f.id])}${f.kind === 'num' && f.unit ? ` ${f.unit}` : ''}`).join(', '))
    : '';
  const check = (id: 'compare' | 'keepD' | 'keepRopes') => (
    <div className="row check" hidden={!shown(id, V)}>
      <input type="checkbox" id={id} checked={!!V[id]} onChange={(e) => set(id, e.target.checked)} />
      <label htmlFor={id}>{t(id)}</label>
    </div>
  );
  const estimate = (p: Prefix) => (
    <div className="row est">
      <button type="button" className="mini" onClick={() => onEstimate(p)}>{t('est_rope')}</button>
      <span className="note" role="status">{estMsg[p] ?? ''}</span>
    </div>
  );
  return (
    <form className="inputs" autoComplete="off" noValidate onSubmit={(e) => e.preventDefault()}>
      <details className="group" open><summary>{t('g_plant')}</summary><div className="rows">{rows(PLANT)}</div></details>
      <details className="group" open><summary>{t('g_layout')}</summary><div className="rows">{rows(LAYOUT)}</div></details>
      <details className="group" open>
        <summary>{t('g_old')}</summary>
        <div className="rows">
          {check('compare')}
          <div className="hint">{t('hint_old')}</div>
          {check('keepD')}
          <div className="subrows" hidden={!V.compare}>
            {rows(MACHINE('o_'))}
            <div className="subhead">{t('oldRopes')}</div>
            {rows(ROPES('o_'))}
            {estimate('o_')}
          </div>
        </div>
      </details>
      <details className="group" open>
        <summary>{t('g_new')}</summary>
        <div className="rows"><div className="hint">{t('hint_new')}</div>{rows(MACHINE('n_'))}</div>
      </details>
      <details className="group" open>
        <summary>{t('g_ropes')}</summary>
        <div className="rows">
          {check('keepRopes')}
          <div className="hint" hidden={!keepRopesHint}>{keepRopesHint}</div>
          {rows(ROPES('n_'))}
          {estimate('n_')}
        </div>
      </details>
      <details className={`group${SERVICE.some((f) => need.has(f.id)) ? '' : ' adv'}`} open={SERVICE.some((f) => need.has(f.id)) || undefined}>
        <summary>{t('g_service')}</summary><div className="rows">{rows(SERVICE)}</div>
      </details>
      <p className="note simple-only">{t('simple_note')}</p>
      {stdNote ? <p className="note simple-only">{stdNote}</p> : null}
    </form>
  );
}
