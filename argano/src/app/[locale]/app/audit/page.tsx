import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { listAudit } from '@/server/queries';

export async function generateMetadata() {
  const t = await getTranslations('audit');
  return { title: t('title') };
}

export default async function AuditPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireCapability(locale, 'audit:view');
  const [t, format, rows] = await Promise.all([getTranslations('audit'), getFormatter(), listAudit(me)]);
  const ids = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <main className="page">
      <div className="flex flex-col gap-1">
        <p className="eyebrow">{me.companyName}</p>
        <h1>{t('title')}</h1>
        <p className="lead">{t('lead')}</p>
      </div>
      <div className="panel overflow-x-auto p-0">
        <table className="data-table">
          <thead><tr><th>{t('when')}</th><th>{t('who')}</th><th>{t('what')}</th><th>{t('object')}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{format.dateTime(r.createdAt, { dateStyle: 'short', timeStyle: 'medium' })}</td>
                <td>{r.userId ? users.get(r.userId) ?? '—' : '—'}</td>
                <td className="mono">{r.action}</td>
                <td className="mono note">{r.entity}{r.entityId ? ` · ${r.entityId}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
