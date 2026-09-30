// Input form of the prototype v12 (buildForm): installation, layout, existing machine, new machine, ropes,
// service. Values are kept as typed (strings); the engine parses them.
import type { FormValues } from '@/calc/types';
import type { Pres } from '@/lib/present/tr';
import { LAYOUT, MACHINE, PLANT, ROPES, SERVICE, shown, type Field } from './fields';
import FieldRow from './FieldRow';

export type Prefix = 'n_' | 'o_';

interface Props {
  P: Pres;
  V: FormValues;
  bad: ReadonlySet<string>;
  set: (id: string, value: string | boolean) => void;
  onEstimate: (p: Prefix) => void;
  estMsg: Partial<Record<Prefix, string>>;
  keepRopesHint: string;
}

export default function CalcForm({ P, V, bad, set, onEstimate, estMsg, keepRopesHint }: Props) {
  const { t } = P;
  const row = (f: Field) => <FieldRow key={f.id} P={P} f={f} V={V} bad={bad} set={set} />;
  const rows = (fields: readonly Field[]) => fields.map(row);
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
      <details className="group adv"><summary>{t('g_service')}</summary><div className="rows">{rows(SERVICE)}</div></details>
      <p className="note simple-only">{t('simple_note')}</p>
    </form>
  );
}
