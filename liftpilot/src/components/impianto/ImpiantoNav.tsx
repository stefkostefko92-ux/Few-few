import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { SessionUser } from '@/lib/auth';
import type { SchedaKey } from '@/lib/impianto/schede';
import type { Collegamento } from '@/server/collega/impianto';
import { schedeImpianto, type SchedeImpianto } from '@/server/impianto/schede';
import TabCorrente from './TabCorrente';

// The bar of an installation (round 53): under the page's path, on every page of the installation, the same tabs in the
// order of the work with each one's state (src/lib/impianto/schede.ts); the page's own tab marked. A tab this user may
// not open is shown, not linked. On a phone the bar scrolls sideways, the page's tab brought into view.
export default async function ImpiantoNav({ user, projectId, corrente, c, dati }: {
  user: SessionUser;
  projectId: string;
  corrente: SchedaKey;
  /** the way already read by the page (the overview) */
  c?: Collegamento;
  /** the tabs already read by the page */
  dati?: SchedeImpianto | null;
}) {
  const [t, s] = await Promise.all([getTranslations('impianto'), dati === undefined ? schedeImpianto(user, projectId, c) : Promise.resolve(dati)]);
  if (!s) return null;
  return (
    <nav className="imp-nav" aria-label={t('nav', { nome: s.nome })}>
      <ol className="imp-tabs">
        {s.schede.map((q) => {
          const body = (
            <>
              {q.n ? <span className="imp-n" aria-hidden="true">{q.n}</span> : null}
              <span className="imp-label">{t(`scheda.${q.key}`)}</span>
              {q.stato ? <span className={`imp-st ${q.stato.tono}`}>{t(`stato.${q.stato.key}`, { n: q.stato.n ?? 0 })}</span> : null}
            </>
          );
          return (
            <li key={q.key} data-scheda={q.key}>
              {q.href ? <Link href={q.href} className="imp-tab" aria-current={q.key === corrente ? 'page' : undefined}>{body}</Link>
                : <span className="imp-tab" aria-disabled="true">{body}</span>}
            </li>
          );
        })}
      </ol>
      <TabCorrente />
    </nav>
  );
}
