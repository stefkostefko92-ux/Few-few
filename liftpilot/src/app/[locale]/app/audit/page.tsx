import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { dateFormat } from '@/lib/dates';
import { can } from '@/lib/rbac';
import { schedaTitle } from '@/lib/rilievi/format';
import type { RilieviT } from '@/lib/rilievi/t';
import { listAuditNamed } from '@/server/queries';
import { schedeForAudit } from '@/server/rilievi/queries';
import AccountHead from '@/components/AccountHead';

export async function generateMetadata() {
  const t = await getTranslations('audit');
  return { title: t('title') };
}

export default async function AuditPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireCapability(locale, 'audit:view');
  const [t, tr, { rows, names }] = await Promise.all([getTranslations('audit'), getTranslations('rilievi'), listAuditNamed(me)]);
  // the survey sheets by their title (rilievi's «Oggetto»), with the way to the sheet while it can be opened: not after
  // it was deleted for good, nor from the trash for whoever does not manage it
  const sheetIds = [...new Set(rows.filter((r) => r.entity === 'Scheda' && r.entityId).map((r) => r.entityId as string))];
  const sheets = new Map((sheetIds.length ? await schedeForAudit(me.companyId, sheetIds) : []).map((s) => [s.id, s]));
  const manageTrash = can(me, 'rilievi:trash-manage');
  const fd = dateFormat(locale);
  const label = (group: 'actions' | 'entities', key: string): string => (t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key);
  const nameOf = (id: string): string => {
    const s = sheets.get(id);
    return s ? schedaTitle(s, tr as unknown as RilieviT) : names.get(id) ?? id;
  };
  return (
    <main className="page">
      <AccountHead area="company" title={t('title')} lead={t('lead')} />
      <div className="table-panel">
        <table className="data-table stack">
          <thead><tr><th>{t('what')}</th><th>{t('when')}</th><th>{t('who')}</th><th>{t('object')}</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const sheet = r.entity === 'Scheda' && r.entityId ? sheets.get(r.entityId) : undefined;
              const open = sheet && r.action !== 'SCHEDA_PURGED' && (!sheet.deletedAt || manageTrash);
              return (
                <tr key={r.id}>
                  <td className="row-title"><b>{label('actions', r.action)}</b></td>
                  <td data-label={t('when')} className="whitespace-nowrap mono">{fd.stamp(r.createdAt)}</td>
                  <td data-label={t('who')}>{r.userId ? names.get(r.userId) ?? '—' : '—'}</td>
                  <td data-label={t('object')}>
                    <span>{label('entities', r.entity)}{r.entityId ? <span className="note"> · {nameOf(r.entityId)}</span> : null}</span>
                    {open ? <> <Link href={`/app/rilievi/${sheet.id}`}>{tr('audit.openScheda')}</Link></> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
