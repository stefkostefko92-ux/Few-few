'use client';

// The right side of the Progetto (round 53): what the software worked out in one strip and what the drawing completes of
// the calculation, then two tabs — the drawing with its dimensions to click, and the checks (their count of problems on
// the tab) — so the side holds one thing at a time. The 3D is the Simulazione's page; the bill «Tavole e documenti». The
// bar of the steps asks for the checks (passi/mostra.ts): its step opens that tab. Both stay mounted: the drawing keeps
// its view while the checks are read.
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { problemiCollaudo, type LiftDerived } from '@/lib/lift';
import { passoId } from '@/lib/passi-moduli';
import { mergeChecks } from '@/shaft';
import { suPasso } from '../passi/mostra';

type Vista = 'disegno' | 'verifiche';

export default function ProgettoRisultati({ derived, fatti, differenze, disegno, verifiche, completo = null }: {
  derived: LiftDerived; fatti: ReactNode; differenze: ReactNode; disegno: ReactNode; verifiche: ReactNode;
  /** the standalone page: everything one under the other, the 3D and the bill with it (as before round 53) */
  completo?: { simulatore: ReactNode; distinta: ReactNode } | null;
}) {
  const t = useTranslations('lift');
  const [vista, setVista] = useState<Vista>('disegno');
  useEffect(() => suPasso((id) => { if (id === passoId('verifiche')) setVista('verifiche'); }), []);
  const problemi = problemiCollaudo(derived.collaudo, [...derived.analysis.res.checks, ...mergeChecks(derived.layout.checks, derived.supportChecks)]);
  // the tab counts what does not pass (as the verdict's strip says it), else what passes with «Attenzione»
  const fails = problemi.filter((c) => c.status === 'fail').length, n = fails || problemi.length, tono = fails ? 'fail' : n ? 'warn' : 'ok';
  const tab = (k: Vista, label: ReactNode) => (
    <button type="button" role="tab" id={`lato-${k}`} aria-controls={`lato-${k}-panel`} aria-selected={vista === k} className={vista === k ? 'on' : undefined} onClick={() => setVista(k)}>{label}</button>
  );
  if (completo) return <>{fatti}{differenze}{completo.simulatore}{disegno}{verifiche}{completo.distinta}</>;
  return (
    <>
      {fatti}
      {differenze}
      <div className="seg-row lato-tabs" role="tablist" aria-label={t('vista_label')}>
        {tab('disegno', t('vista_disegno'))}
        {tab('verifiche', <>{t('vista_verifiche')} <span className={`status-pill ${tono}`}>{n ? n : '✓'}</span></>)}
      </div>
      <div role="tabpanel" id="lato-disegno-panel" aria-labelledby="lato-disegno" hidden={vista !== 'disegno'}>{disegno}</div>
      <div role="tabpanel" id="lato-verifiche-panel" aria-labelledby="lato-verifiche" hidden={vista !== 'verifiche'}>{verifiche}</div>
    </>
  );
}
