import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { SchedeImpianto } from '@/server/impianto/schede';

// The overview's «Prossimo passo» (round 53): one sentence and one button — the step the installation waits for, the page
// of its tab (src/lib/impianto/schede.ts prossimoDi). A step whose page this user may not open says whose it is instead.
export default async function ProssimoPasso({ s, archiviato }: { s: SchedeImpianto; archiviato: boolean }) {
  const [t, tp] = await Promise.all([getTranslations('impianto.prossimo'), getTranslations('projects')]);
  if (archiviato) return null;
  const p = s.prossimo, href = s.schede.find((q) => q.key === p.scheda)?.href ?? null;
  const handoff = p.scheda === 'calcolo' ? tp('handoff_calcolo') : p.scheda === 'progetto' ? tp('handoff_progetto') : null;
  return (
    <section className="imp-next" aria-labelledby="imp-next-title">
      <div className="imp-next-text">
        <h2 id="imp-next-title" className="eyebrow">{t('titolo')}</h2>
        <p>{t(p.key, { n: p.n ?? 0 })}</p>
      </div>
      {href ? <Link className="btn btn-primary" href={href}>{t(`apri.${p.scheda}`)}</Link> : handoff ? <p className="note">{handoff}</p> : null}
    </section>
  );
}
