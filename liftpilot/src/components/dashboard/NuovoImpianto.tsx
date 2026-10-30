import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import Icon from '@/components/Icon';

/** The way to a new installation (round 45: one — the type of intervention is chosen in its «Calcolo argano»), with the
 *  steps every installation goes through, in their order (round 53: the tabs of its bar, components/impianto/ImpiantoNav.tsx). */
export default async function NuovoImpianto({ passi = true }: { passi?: boolean }) {
  const [t, tp, ts] = await Promise.all([getTranslations('projects'), getTranslations('collega.passi'), getTranslations('impianto.scheda')]);
  return (
    <div className="dash-nuovo">
      <Link className="btn btn-primary" href="/app/projects/new"><Icon name="plus" size={16} />{t('new')}</Link>
      {passi ? (
        <ol className="dash-passi" aria-label={tp('label')}>
          {(['rilievo', 'calcolo', 'progetto', 'simulazione', 'relazione', 'documenti'] as const).map((k) => <li key={k}>{ts(k)}</li>)}
        </ol>
      ) : null}
    </div>
  );
}
