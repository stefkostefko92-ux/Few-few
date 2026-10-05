// Result column of the prototype v12 (renderResults): proposal, result in brief, then the technical tables
// (folded in simple mode), UNI 10411-1 adaptations, values to check, copyable summary.
import { useRef, useState, type ReactNode } from 'react';
import { NORMA_SIGLA, adeguamentiDovuti, type Collaudo } from '@/lib/lift';
import type { CalcKey, Pres } from '@/lib/present/tr';
import type { Analysis } from '@/lib/present/analysis';
import { quickRows } from '@/lib/present/quick';
import { summaryText } from '@/lib/present/summary';
import type { Texts } from '@/lib/present/texts';
import { techCards } from './TechCards';
import { Card, Flag, KV, Note, Pill } from './ui';

export type UseKey = 'pick' | number;
const ADAPT: readonly CalcKey[] = ['a_brake', 'a_timer', 'a_overspeed', 'a_stop', 'a_power'];

interface Props {
  P: Pres;
  X: Texts;
  a: Analysis;
  mode: 'simple' | 'expert';
  badCount: number;
  brand?: string;
  /** the acceptance test: the adaptations follow its standard, as the report sets them out */
  collaudo: Collaudo;
  /** loads a proposal into the new-machine fields; absent on a saved calculation */
  onUse?: (key: UseKey) => void;
  propMsg?: string;
  /** only the proposal: the new machine is still to enter, nothing else is worked out yet */
  proposalOnly?: boolean;
}

function ProposalCard({ P, X, a, onUse, propMsg }: Pick<Props, 'P' | 'X' | 'a' | 'onUse' | 'propMsg'>) {
  const { t } = P, { sizing } = a, N = a.ctx.N;
  if (!sizing.pick) {
    return <Card title={t('c_prop')} refText={t('prop_ref')}><Note bad>{X.noneText(sizing)}</Note><Note>{X.critText(sizing)}</Note></Card>;
  }
  const p = sizing.pick;
  return (
    <Card title={t('c_prop')} refText={t('prop_ref')}>
      <KV rows={X.proposalRows(p, N, sizing.fixedD, !!sizing.keep)} />
      {onUse ? (
        <div className="btnrow">
          <button type="button" className="primary" onClick={() => onUse('pick')}>{t('p_use')}</button>
          <span className="note" role="status">{propMsg}</span>
        </div>
      ) : null}
      <h3 className="sub">{X.altText(sizing)}</h3>
      <div className="tbl">
        <table>
          <thead><tr>{X.proposalHead().map((h, j) => <th key={h} className={j ? 'num' : undefined}>{h}</th>)}{onUse ? <th className="num" /> : null}</tr></thead>
          <tbody>
            {sizing.options.map((o, j) => (
              <tr key={`${o.D}-${o.n}-${o.d}`} className={o === p ? 'picked' : undefined}>
                {X.proposalCells(o, p).map((c, k) => <td key={k} className={k ? 'num' : undefined}>{c}</td>)}
                {onUse ? <td className="num"><button type="button" className="mini" onClick={() => onUse(j)}>{t('p_use_row')}</button></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>{X.critText(sizing)}</Note>
    </Card>
  );
}

function CopyCard({ P, text }: { P: Pres; text: string }) {
  const { t } = P;
  const [msg, setMsg] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(t('copied'));
    } catch {
      area.current?.focus();
      area.current?.select();
      setMsg(t('copyfail'));
    }
  };
  return (
    <Card title={t('c_copy')}>
      <div className="btnrow">
        <button type="button" onClick={() => void copy()}>{t('copy')}</button>
        <span className="note" role="status">{msg}</span>
      </div>
      <textarea ref={area} readOnly value={text} aria-label={t('c_copy')}
        className="w-full min-h-[110px] rounded-lg border border-rule bg-surface2 p-2 font-mono text-[12px] leading-[1.45] text-ink" />
    </Card>
  );
}

export default function Results(props: Props) {
  const { P, X, a, mode, badCount, brand } = props, { t } = P, { ctx, res, sens } = a, { I, N } = ctx;
  if (props.proposalOnly) return <div className="results"><ProposalCard P={P} X={X} a={a} onUse={props.onUse} propMsg={props.propMsg} /></div>;
  const quick = (
    <Card key="quick" title={t('q_title')}>
      <ul className="quick">
        {quickRows(P, X, N, res, sens).map((q) => (
          <li key={q.key}><div className="qa"><span>{t(q.key)}</span><Pill status={q.status}>{X.st(q.status)}</Pill></div><div className="qd">{q.text}</div></li>
        ))}
      </ul>
      <Note>{t('q_norm')}</Note>
    </Card>
  );
  // the adaptations the standard of the test asks (report/collaudo.ts adaptSection, the same cases)
  const C = props.collaudo;
  const adapt = I.context !== 'repl' ? <Card key="adapt" title={t('c_ucmp')} refText="EN 81-20 ⚠"><Note>{t('n_new')}</Note></Card>
    : adeguamentiDovuti(C) ? <Card key="adapt" title={t('c_adapt')} refText="UNI 10411-1 ⚠"><ul className="plain">{ADAPT.map((k) => <li key={k}>{t(k)}</li>)}</ul><Note>{t('a_src')}</Note></Card>
      : C.norma === 'en81' ? <Card key="adapt" title={t('c_adapt_en81')} refText="EN 81-20 ⚠"><Note>{t('a_en81')}</Note></Card>
        : C.parti.includes('machine') ? <Card key="adapt" title={t('c_adapt_11')} refText="UNI 10411-11 ⚠"><Note>{t('a_11')}</Note></Card>
          : <Card key="adapt" title={t('c_adapt_other')} refText={NORMA_SIGLA[C.norma]}><Note>{t('a_other', { norma: NORMA_SIGLA[C.norma] })}</Note></Card>;
  const verify = (
    <Card key="verify" title={t('c_verify')}>
      <ul className="plain">{X.verifyList(I, N, res).map((x) => <li key={x}><Flag /> {x}</li>)}</ul>
    </Card>
  );
  const tech = techCards(P, X, a);
  const copy = <CopyCard key="copy" P={P} text={summaryText(P, X, a, { badVisible: badCount, brand })} />;
  const head: ReactNode[] = [<ProposalCard key="prop" P={P} X={X} a={a} onUse={props.onUse} propMsg={props.propMsg} />, quick];
  return (
    <div className="results">
      {mode === 'simple'
        ? [...head, adapt,
          <details key="more" className="more"><summary>{t('q_more')}</summary><div className="inner">{[...tech, verify]}</div></details>, copy]
        : [...head, ...tech, adapt, verify, copy]}
    </div>
  );
}
