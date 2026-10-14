import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { companyMatrix } from '@/server/permissions';
import AccountHead from '@/components/AccountHead';
import PermissionsPanel from '@/components/permessi/PermissionsPanel';

export async function generateMetadata() {
  const t = await getTranslations('permessi');
  return { title: t('title') };
}

// The owner's page of the company's rights (round 42): what each colleague role may do, from the default matrix with the
// company's changes (src/lib/rbac.ts, src/lib/permissions.ts). Only who manages the rights: the owner (and the platform
// for its own company, which saves here without a request's reference; another company's matrix is under
// /app/admin/permessi/<id>, where the save asks for the reference of its owner's written request).
export default async function PermessiPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireCapability(locale, 'permissions:manage');
  const [t, matrix] = await Promise.all([getTranslations('permessi'), companyMatrix(me.companyId)]);
  if (!matrix) notFound();
  return (
    <main className="page">
      <AccountHead area="company" title={t('title')} lead={t('lead')} />
      <PermissionsPanel matrix={matrix} />
    </main>
  );
}
