'use client';

// The state of the relazione tecnica di modifica being prepared, at the top of the workspace (the server's derivation,
// summary.ts): the checks it requires (not satisfied, warnings — never the outcome of the verifica straordinaria), the
// approval regime, how many sections and documents, and what is still missing — the data the issue cannot do without
// first, then those it prints as «Dati mancanti ⚠».
import { useTranslations } from 'next-intl';
import type { RtSummary } from '@/server/rt/summary';

export default function RtEsito({ summary: s }: { summary: RtSummary }) {
  const t = useTranslations('rt');
  const bloccanti = s.mancanti.filter((m) => m.bloccante), altri = s.mancanti.filter((m) => !m.bloccante);
  const daAllegare = s.documenti.filter((d) => d.stato === 'da_allegare' && !d.consigliato).length;
  const cls = s.esito.verdict === 'FAIL' ? 'fail' : s.esito.verdict === 'WARN' ? 'warn' : 'ok';
  return (
    <section className="panel rt-esito" aria-labelledby="rt-esito-h" data-rt="esito">
      <h2 id="rt-esito-h" className="sr-only">{t('esito.titolo')}</h2>
      <dl className="rt-kpi">
        <div><dt>{t('esito.verifiche')}</dt><dd><span className={`status-pill ${cls}`}>{t(`esito.${s.esito.verdict}`, { fail: s.esito.failCount, warn: s.esito.warnCount })}</span></dd></div>
        <div><dt>{t('esito.sezioni')}</dt><dd className="num">{s.sezioni.length}</dd></div>
        <div><dt>{t('esito.documenti')}</dt><dd>{daAllegare ? t('esito.daAllegare', { n: daAllegare }) : t('esito.documentiOk')}</dd></div>
        <div><dt>{t('esito.regime')}</dt><dd>{s.regime.sigla ? `${s.regime.sigla}${s.regime.origine === 'anno' && !s.regime.confermata ? ` ${t('esito.daConfermare')}` : ''}` : t('esito.regimeNo')}</dd></div>
      </dl>
      {bloccanti.length ? (
        <div className="alert alert-warn" role="status">
          <p className="m-0">{t('esito.bloccanti', { n: bloccanti.length })}</p>
          <ul className="rt-list-plain">{bloccanti.map((m) => <li key={m.campo}>{m.testo}</li>)}</ul>
        </div>
      ) : null}
      {altri.length ? (
        <details className="rt-mancanti">
          <summary>{t('esito.mancanti', { n: altri.length })}</summary>
          <ul className="rt-list-plain">{altri.map((m) => <li key={m.campo}>{m.testo}</li>)}</ul>
        </details>
      ) : null}
      {s.regime.legge && !s.regime.coerente ? <p className="alert alert-bad" role="alert">{t('esito.regimeIncoerente')}</p> : null}
    </section>
  );
}
