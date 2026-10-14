import { getTranslations } from 'next-intl/server';
import { columnsOf } from '@/lib/permissions';
import type { companyMatrix } from '@/server/permissions';
import PermissionsMatrix from './PermissionsMatrix';
import '@/app/permessi.css';

/** The matrix of a company as stored, for its owner's page and the platform's (`platform`: its save asks for the
 *  reference of the owner's written request): a refused save comes back here with the matrix in force (the client takes
 *  the new version by its stamp). */
export default async function PermissionsPanel({ matrix, platform = false }: {
  matrix: NonNullable<Awaited<ReturnType<typeof companyMatrix>>>; platform?: boolean;
}) {
  const t = await getTranslations('permessi');
  return (
    <section aria-label={t('matrix')} className="pm-section">
      <PermissionsMatrix companyId={matrix.id} stamp={matrix.stamp} grants={columnsOf(matrix.overrides)} platform={platform} />
    </section>
  );
}
