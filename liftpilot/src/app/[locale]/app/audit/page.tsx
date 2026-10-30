import { getTranslations, setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { dateFormat } from '@/lib/dates';
import { can } from '@/lib/rbac';
import { schedaTitle } from '@/lib/rilievi/format';
import type { RilieviT } from '@/lib/rilievi/t';
import { listAuditNamed } from '@/server/queries';
import { schedeForAudit } from '@/server/rilievi/queries';
import { nomiImpianti } from '@/server/collega/queries';
import AccountHead from '@/components/AccountHead';

export async function generateMetadata() {
  const t = await getTranslations('audit');
  return { title: t('title') };
}

/** A change of the rights matrix as the save writes it (src/server/permission-actions.ts): the platform's carries the
 *  reference of the owner's written request. */
const permissionMeta = z.object({
  role: z.string(), capability: z.string(), from: z.boolean(), to: z.boolean(), by: z.enum(['owner', 'platform']), request: z.string().max(400).optional(),
});

/** A survey linked to an installation or unlinked from it (src/server/collega/service.ts): which installation. */
const linkMeta = z.object({ projectId: z.string().max(40) }).passthrough();

export default async function AuditPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireCapability(locale, 'audit:view');
  const [t, tr, tro, tp, { rows, names }] = await Promise.all([getTranslations('audit'), getTranslations('rilievi'), getTranslations('roles'),
    getTranslations('permessi'), listAuditNamed(me)]);
  // the survey sheets by their title (rilievi's «Oggetto»), with the way to the sheet while it can be opened: not after
  // it was deleted for good, nor from the trash for whoever does not manage it
  const sheetIds = [...new Set(rows.filter((r) => r.entity === 'Scheda' && r.entityId).map((r) => r.entityId as string))];
  const sheets = new Map((sheetIds.length ? await schedeForAudit(me.companyId, sheetIds) : []).map((s) => [s.id, s]));
  const manageTrash = can(me, 'rilievi:trash-manage');
  // the installation a survey was linked to or unlinked from, by its name (the company's; another id is shown as it is)
  const linkOf = (r: (typeof rows)[number]) => (r.action === 'SCHEDA_LINKED' || r.action === 'SCHEDA_UNLINKED' ? linkMeta.safeParse(r.meta) : null);
  const linked = await nomiImpianti(me, rows.flatMap((r) => { const m = linkOf(r); return m?.success ? [m.data.projectId] : []; }));
  const fd = dateFormat(locale);
  const label = (group: 'actions' | 'entities', key: string): string => (t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key);
  // a change of the rights: which role, which right, before → after in the matrix's words; made by the platform, it says
  // so (not who)
  const permission = (meta: unknown) => {
    const m = permissionMeta.safeParse(meta);
    if (!m.success) return null;
    const role = tro.has(m.data.role) ? tro(m.data.role as 'OWNER') : m.data.role;
    const right = tp.has(`caps.${m.data.capability}`) ? tp(`caps.${m.data.capability}` as 'caps.audit:view') : m.data.capability;
    const text = t('permission', { role, right, from: tp(m.data.from ? 'on' : 'off'), to: tp(m.data.to ? 'on' : 'off') });
    return { by: m.data.by, text: m.data.request ? `${text} · ${t('permissionRequest', { request: m.data.request })}` : text };
  };
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
              const perm = r.action === 'PERMISSIONS_CHANGED' ? permission(r.meta) : null, lk = linkOf(r);
              return (
                <tr key={r.id}>
                  <td className="row-title"><b>{label('actions', r.action)}</b></td>
                  <td data-label={t('when')} className="whitespace-nowrap mono">{fd.stamp(r.createdAt)}</td>
                  <td data-label={t('who')}>{perm?.by === 'platform' ? t('platform') : r.userId ? names.get(r.userId) ?? '—' : '—'}</td>
                  <td data-label={t('object')}>
                    <span>{label('entities', r.entity)}{r.entityId ? <span className="note"> · {nameOf(r.entityId)}</span> : null}
                      {perm ? <span className="note"> · {perm.text}</span> : null}
                      {lk?.success ? <span className="note"> · {t('impianto', { name: linked.get(lk.data.projectId) ?? lk.data.projectId })}</span> : null}</span>
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
