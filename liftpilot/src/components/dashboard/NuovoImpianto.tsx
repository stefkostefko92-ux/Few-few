import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import Icon from '@/components/Icon';

/** The way to a new installation (round 45: one — the type of intervention is chosen in its «Calcolo argano»), with the
 *  four steps every installation goes through, in their order (the stepper of its page: components/collega/Passi.tsx). */
export default async function NuovoImpianto({ passi = true }: { passi?: boolean }) {
  const [t, tp] = await Promise.all([getTranslations('projects'), getTranslations('collega.passi')]);
  return (
    <div className="dash-nuovo">
      <Link className="btn btn-primary" href="/app/projects/new"><Icon name="plus" size={16} />{t('new')}</Link>
      {passi ? (
        <ol className="dash-passi" aria-label={tp('label')}>
          {(['rilievo', 'calcolo', 'progetto', 'documenti'] as const).map((k) => <li key={k}>{tp(k)}</li>)}
        </ol>
      ) : null}
    </div>
  );
}
