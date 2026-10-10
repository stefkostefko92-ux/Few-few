import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { dateFormat } from '@/lib/dates';
import { listAuditNamed } from '@/server/queries';
import AccountHead from '@/components/AccountHead';

export async function generateMetadata() {
  const t = await getTranslations('audit');
  return { title: t('title') };
}

export default async function AuditPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireCapability(locale, 'audit:view');
  const [t, { rows, names }] = await Promise.all([getTranslations('audit'), listAuditNamed(me)]);
  const fd = dateFormat(locale);
  const label = (group: 'actions' | 'entities', key: string): string => (t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key);
  return (
    <main className="page">
      <AccountHead area="company" title={t('title')} lead={t('lead')} />
      <div className="table-panel">
        <table className="data-table stack">
          <thead><tr><th>{t('what')}</th><th>{t('when')}</th><th>{t('who')}</th><th>{t('object')}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="row-title"><b>{label('actions', r.action)}</b></td>
                <td data-label={t('when')} className="num whitespace-nowrap">{fd.stamp(r.createdAt)}</td>
                <td data-label={t('who')}>{r.userId ? names.get(r.userId) ?? '—' : '—'}</td>
                <td data-label={t('object')}>
                  <span>{label('entities', r.entity)}{r.entityId ? <span className="note"> · {names.get(r.entityId) ?? r.entityId}</span> : null}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
