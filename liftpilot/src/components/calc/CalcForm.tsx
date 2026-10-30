// Input form of the prototype v12 (buildForm): installation, layout, existing machine, new machine, ropes,
// service. Values are kept as typed (strings); the engine parses them. A value still to enter is marked as needed, a
// standard value of the software carries its badge (src/lib/calc-blank.ts). Round 52: every row and check box with its
// «?» (messages/aiuto/calcolo.json, by the field's id without the n_/o_ of the new or the existing machine — the same
// meaning for both); the «adv» rows stay the calculator's own mark of the simple mode, never `esperto` on top.
import type { FormValues } from '@/calc/types';
import type { CalcKey, Pres } from '@/lib/present/tr';
import { isStandard } from '@/lib/calc-blank';
import { testoAiuto } from '@/lib/aiuto';
import { passoId, type PassoCalcolo } from '@/lib/passi-moduli';
import AIUTO from '../../../messages/aiuto/calcolo.json';
import Etichetta from '../aiuto/Etichetta';
import { NumeroPasso } from '../passi/BarraPassi';
import { FUNI_10411, LAYOUT, MACHINE, PLANT, ROPES, SERVICE, shown, type Field } from './fields';
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
  /** the existing machine's group (compared, kept sheave and ropes): an existing lift whose machine is replaced; absent:
   *  as the context says */
  esistente?: boolean;
  /** a modernisation that keeps the machine (round 45): the machine's group is the existing machine's, with its title
   *  and hint, and the ropes' group the existing ropes' when they stay too (`funi`: its title); null: the new machine */
  resta?: { title: string; hint: string; funi: string | null } | null;
  /** the mode «Esperto» (ModoCalc.tsx): the service's group opens by itself */
  esperto?: boolean;
  /** the groups' numbers in the bar of the steps (round 52); absent: none */
  numeri?: Partial<Record<PassoCalcolo, number>>;
}

export default function CalcForm({ P, V, bad, set, onEstimate, estMsg, keepRopesHint, need, texts, esistente = V.context === 'repl', resta = null, esperto = false, numeri = {} }: Props) {
  const { t } = P;
  // a group as a step: its section's id and its number before its title
  const passo = (k: PassoCalcolo) => ({ id: passoId(k), className: 'group passo-sez' });
  const row = (f: Field) => <FieldRow key={f.id} P={P} f={f} V={V} bad={bad} set={set} need={need.has(f.id)} std={isStandard(V, f.id)} texts={texts}
    aiuto={testoAiuto(AIUTO, f.key ?? f.id)} />;
  const aiutoCheck = { compare: testoAiuto(AIUTO, 'compare'), keepD: testoAiuto(AIUTO, 'keepD'), keepRopes: testoAiuto(AIUTO, 'keepRopes') };
  const rows = (fields: readonly Field[]) => fields.map(row);
  // the expert rows at the software's standard value, named in the simple mode where they are not shown
  const expert = [...PLANT, ...LAYOUT, ...MACHINE('n_'), ...(V.compare ? MACHINE('o_') : []), ...SERVICE]
    .filter((f) => (f.adv || SERVICE.includes(f)) && f.kind === 'num' && shown(f.id, V) && isStandard(V, f.id));
  const stdNote = texts.stdInUse && expert.length
    ? texts.stdInUse(expert.map((f) => `${t((f.key ?? f.id) as CalcKey)}${f.id.startsWith('o_') ? ` (${t('g_old')})` : ''} ${String(V[f.id])}${f.kind === 'num' && f.unit ? ` ${f.unit}` : ''}`).join(', '))
    : '';
  // the service's group, expert only: open in «Esperto», and open and shown in the simple mode too while a value of it
  // is still to enter or out of range
  const service = SERVICE.some((f) => need.has(f.id) || bad.has(f.id));
  const check = (id: 'compare' | 'keepD' | 'keepRopes') => (
    <div className="row check" hidden={!shown(id, V) || (id === 'keepRopes' && !!resta)}>
      <input type="checkbox" id={id} checked={!!V[id]} onChange={(e) => set(id, e.target.checked)} />
      <Etichetta htmlFor={id} aiuto={aiutoCheck[id]} nome={t(id)}>{t(id)}</Etichetta>
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
      <details {...passo('impianto')} open><summary><NumeroPasso n={numeri.impianto} />{t('g_plant')}</summary><div className="rows">{rows(PLANT)}</div></details>
      <details {...passo('disposizione')} open><summary><NumeroPasso n={numeri.disposizione} />{t('g_layout')}</summary><div className="rows">{rows(LAYOUT)}</div></details>
      <details {...passo('esistente')} open hidden={!esistente || !!resta}>
        <summary><NumeroPasso n={numeri.esistente} />{t('g_old')}</summary>
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
      <details {...passo('nuovo')} open>
        <summary><NumeroPasso n={numeri.nuovo} />{resta ? resta.title : t('g_new')}</summary>
        <div className="rows"><div className="hint">{resta ? resta.hint : t('hint_new')}</div>{rows(MACHINE('n_'))}</div>
      </details>
      <details {...passo('funi')} open>
        <summary><NumeroPasso n={numeri.funi} />{resta?.funi ?? t('g_ropes')}</summary>
        <div className="rows">
          {check('keepRopes')}
          <div className="hint" hidden={!keepRopesHint}>{keepRopesHint}</div>
          {rows(ROPES('n_'))}
          {estimate('n_')}
        </div>
      </details>
      <details {...passo('funi10411')} open hidden={!esistente}>
        <summary><NumeroPasso n={numeri.funi10411} />{t('g_funi10411')}</summary>
        <div className="rows"><div className="hint">{t('hint_funi10411')}</div>{rows(FUNI_10411.filter((f) => shown(f.id, V)))}</div>
      </details>
      <details id={passoId('servizio')} className={`group passo-sez${service ? '' : ' adv'}`} open={service || esperto || undefined}>
        <summary><NumeroPasso n={numeri.servizio} />{t('g_service')}</summary><div className="rows">{rows(SERVICE)}</div>
      </details>
      <p className="note simple-only">{t('simple_note')}</p>
      {stdNote ? <p className="note simple-only">{stdNote}</p> : null}
    </form>
  );
}
