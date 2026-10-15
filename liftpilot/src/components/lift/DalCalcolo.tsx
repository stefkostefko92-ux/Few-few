'use client';

// What the Progetto draws on (round 45): its «Calcolo argano», read only — the type of intervention with its scale, the
// standard of the test and the parts answered «Sì», the machine as the calculation verifies it, the rated load, speed,
// car mass, roping, machine's place and ropes. Changing any of them is the calculation's work: the link opens it on
// this one, for whoever makes the calculations.
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import SectionTitle from '@/components/project/SectionTitle';
import type { FormValues } from '@/calc/types';
import { NORMA_SIGLA, TIPI_INTERVENTO, type Collaudo, type TipoIntervento } from '@/lib/lift';
import { analyse } from '@/lib/present/analysis';
import type { Texts } from '@/lib/present/texts';
import type { Pres } from '@/lib/present/tr';

/** The «Calcolo argano» a drawing is made on, as the page gives it to the browser. */
export interface BaseProgetto {
  id: string;
  /** when it was saved (ISO) */
  createdAt: string;
  values: FormValues;
  collaudo: Collaudo;
  tipo: TipoIntervento;
}

interface Props {
  P: Pres;
  X: Texts;
  base: BaseProgetto;
  projectId: string;
  /** the date of the base as the page writes it */
  when: string;
  /** whoever makes the calculations: the link to change it */
  canCalc: boolean;
}

export default function DalCalcolo({ P, X, base, projectId, when, canCalc }: Props) {
  const t = useTranslations('progetto'), ti = useTranslations('calculations.intervento'), tl = useTranslations('lift');
  const { ctx } = useMemo(() => analyse(base.values), [base.values]), { I, N } = ctx, { fmt } = P;
  const C = base.collaudo, i = TIPI_INTERVENTO.indexOf(base.tipo);
  const parti = C.norma === 'en81' ? null : C.parti.map((p) => tl(`parte_${p}`).toLowerCase()).join(', ');
  const fact = (dt: string, dd: string) => <div><dt>{dt}</dt><dd className="num">{dd}</dd></div>;
  return (
    <div className="dal-calcolo">
      <SectionTitle icon="calculator-check" eyebrow={when}>{t('dalCalcolo')}</SectionTitle>
      <p className="calc-ruolo">
        <span className="tipo-badge" data-tipo={base.tipo}>
          <span className="tipo-scala" aria-hidden="true">{[0, 1, 2].map((s) => <i key={s} className={s <= i ? 'piena' : undefined} />)}</span>
          {ti(base.tipo)}
        </span>
        <span>{NORMA_SIGLA[C.norma]}</span>
        {C.rifacimento && C.norma !== 'en81' ? <span className="badge">{ti('rif_preset')}</span> : null}
      </p>
      {parti ? <p className="note">{t('parti', { parti })}</p> : null}
      <dl className="facts">
        {fact(P.t('Q'), `${fmt(I.Q, 0)} kg`)}
        {fact(P.t('v'), `${fmt(I.v, 2)} m/s`)}
        {fact(P.t('P'), `${fmt(I.P, 0)} kg`)}
        {fact(P.t('r'), `${I.r}:1`)}
        {fact(P.t('layout'), P.t(`lay_${I.layout}`))}
        {/* ropes the test leaves out stay as they are (a «Solo argano» answered «No»): said so, never «new» */}
        {fact(C.norma !== 'en81' && !C.parti.includes('ropes') ? ti('funi_restano') : P.t('g_ropes'), `${N.n} × Ø${fmt(N.d, 1)} mm`)}
        <div className="wide"><dt>{t('argano')}</dt><dd className="num">{X.machineShort(N)}</dd></div>
      </dl>
      {/* (the standalone page has no installation: the calculation is its other tab) */}
      {projectId ? (
        <div className="btnrow">
          <Link className="btn btn-sm" href={`/app/calculations/${base.id}`}>{t('apri')}</Link>
          {canCalc ? <Link className="btn btn-sm" href={`/app/projects/${projectId}/calc?from=${base.id}&dal=progetto`}>{t('cambia')}</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
