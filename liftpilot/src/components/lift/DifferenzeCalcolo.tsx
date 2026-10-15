'use client';

// «Il progetto completa il calcolo» (round 45): what the drawing gives its «Calcolo argano» — the travel from its floors,
// the rope beyond the travel, the diverting pulley's distance and height, a machine below's head pulleys — beside the
// calculation's values as saved, each marked where they differ beyond the screen's tolerance (differenzeCalcolo); the
// extra bends of a machine below's head pulleys are listed, never a difference by themselves. The machine's verdict on
// the calculation's values and on the drawing's, and the largest car the drawn shaft takes. Equal: «Calcolo e progetto
// coincidono». Different: «Porta nel calcolo» brings the drawing's values into the calculation (for whoever makes it).
// Round 46: the drawn travel against the logbook's brings the travel among the changed parts of the test, or takes it out
// (said under the table); on a «Solo argano» base that change makes the type to review — the save refuses it
// ('tipoDaRivedere') and «Porta nel calcolo» is offered.
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import SectionTitle from '@/components/project/SectionTitle';
import type { FormValues } from '@/calc/types';
import { tipoDaRivedere, type Collaudo, type LiftDerived, type TipoIntervento } from '@/lib/lift';
import { macchinaEsistente } from '@/lib/lift/kept';
import { differenzeCalcolo, type DifferenzaKey } from '@/lib/lift/progetto';
import { cabinaMassima } from '@/lib/lift/porta';
import { analyse } from '@/lib/present/analysis';
import { verdictStatus, type Texts } from '@/lib/present/texts';
import type { CalcKey, Pres } from '@/lib/present/tr';
import { Pill } from '../calc/ui';

interface Props {
  P: Pres;
  X: Texts;
  /** the base calculation's values, as saved */
  base: FormValues;
  derived: LiftDerived;
  /** «Porta nel calcolo»: the drawing kept, then the calculation opened with its values; null — not for this user */
  porta: (() => void) | null;
  pending: boolean;
  /** the base's test as the documents read it, and its type */
  collaudo: Collaudo;
  tipo: TipoIntervento;
}

const DEC: Readonly<Record<DifferenzaKey, number>> = { H: 2, L0: 2, dx: 3, h: 3, Hv: 2, nps: 0 };

export default function DifferenzeCalcolo({ P, X, base, derived, porta, pending, collaudo, tipo }: Props) {
  const t = useTranslations('progetto'), { fmt } = P;
  const rows = useMemo(() => differenzeCalcolo(base, derived.values, derived.headPulleys), [base, derived]);
  const prima = useMemo(() => verdictStatus(analyse(base).res), [base]), ora = verdictStatus(derived.analysis.res);
  const largest = useMemo(() => cabinaMassima(derived.shaft), [derived.shaft]);
  const differ = rows.some((r) => r.differs), rivedere = tipoDaRivedere(tipo, derived.collaudo);
  // the travel among the changed parts on the base's values and on the drawing's (the logbook's travel against each)
  const H = collaudo.libretto?.H, corsa = derived.collaudo.parti.includes('travel');
  const corsaCambia = H !== undefined && collaudo.norma !== 'en81' && collaudo.parti.includes('travel') !== corsa;
  const val = (k: DifferenzaKey, x: number | null): string => (x === null ? '—' : k === 'nps' ? fmt(x, 0) : `${fmt(x, DEC[k])} m`);
  return (
    <section className="panel differenze" aria-labelledby="differenze-title">
      <SectionTitle level={3} icon="calculator-check" id="differenze-title">{t('differenze')}</SectionTitle>
      {/* the machine kept: L0 and the diverting pulley are the calculation's (ProgettoFuni), the drawing gives the travel */}
      <p className="note">{t(macchinaEsistente({ calc: base, collaudo }) ? 'differenzeLeadKept' : 'differenzeLead')}</p>
      <div className="tbl">
        <table>
          <thead><tr><th>{t('colValore')}</th><th className="num">{t('colCalcolo')}</th><th className="num">{t('colDisegno')}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.differs ? 'differs' : undefined}>
                <th scope="row">{P.t(r.key as CalcKey)}{r.key === 'nps' && derived.headPulleys > 2 ? ` ${t('npsTesta')}` : ''}</th>
                <td className="num">{val(r.key, r.base)}</td>
                <td className="num">{val(r.key, r.drawn)}{r.differs ? <span className="badge warn">{t('differisce')}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="differenze-esito">
        <span>{t('esito')}</span>
        <span>{t('colCalcolo')} <Pill status={prima}>{X.st(prima)}</Pill></span>
        <span>{t('colDisegno')} <Pill status={ora}>{X.st(ora)}</Pill></span>
      </p>
      <p className="note">{t('cabinaMax', { kg: fmt(largest, 0) })}</p>
      {corsaCambia ? <p className="note" data-corsa={corsa ? 'entra' : 'esce'}>{t(corsa ? 'corsaEntra' : 'corsaEsce', { H: fmt(H, 2) })}</p> : null}
      {rivedere ? <p className="alert alert-bad" role="alert" data-rivedere="tipo">{t('tipoDaRivedere')}</p> : null}
      {differ || rivedere ? (
        porta ? <div className="btnrow"><button type="button" className="btn btn-sm" onClick={porta} disabled={pending}>{t('porta')}</button></div> : null
      ) : <p className="alert alert-ok" role="status">{t('coincidono')}</p>}
    </section>
  );
}
