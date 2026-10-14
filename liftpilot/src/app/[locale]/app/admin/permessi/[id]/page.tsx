import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { idSchema } from '@/lib/schemas';
import { companyMatrix } from '@/server/permissions';
import AccountHead from '@/components/AccountHead';
import Icon from '@/components/Icon';
import PermissionsPanel from '@/components/permessi/PermissionsPanel';

export async function generateMetadata() {
  const t = await getTranslations('permessi');
  return { title: t('title') };
}

// The platform's view of a company's rights matrix (round 42), from the company's row in /app/admin: the same screen as
// the owner's, every change in the company's activity log attributed to the platform (PERMISSIONS_CHANGED, by:
// 'platform'). The ceiling stays in the code (the hard rules of src/lib/rbac.ts): no matrix of the platform.
export default async function AdminPermessiPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireCapability(locale, 'platform:admin');
  const cid = idSchema.safeParse(id);
  const matrix = cid.success ? await companyMatrix(cid.data) : null;
  if (!matrix) notFound();
  const t = await getTranslations('permessi');
  return (
    <main className="page">
      <AccountHead area="platform" title={t('adminTitle', { company: matrix.name })} lead={t('adminLead')}
        actions={<Link className="btn" href="/app/admin"><Icon name="arrow-left" size={18} />{t('back')}</Link>} />
      <PermissionsPanel matrix={matrix} />
    </main>
  );
}
