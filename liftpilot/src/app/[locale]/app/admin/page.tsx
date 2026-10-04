import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { dateFormat } from '@/lib/dates';
import { listCompanies } from '@/server/queries';
import { setCompanyActiveAction, setCompanyExemptAction } from '@/server/user-actions';
import CreateCompanyForm from '@/components/CreateCompanyForm';

export async function generateMetadata() {
  const t = await getTranslations('admin');
  return { title: t('title') };
}

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireCapability(locale, 'platform:admin');
  const [t, tb, companies, lang] = await Promise.all([getTranslations('admin'), getTranslations('billing'), listCompanies(), getLocale()]);
  const fd = dateFormat(locale);
  return (
    <main className="page">
      <div className="page-head">
        <div className="titles">
          <h1>{t('title')}</h1>
          <p className="lead">{t('lead')}</p>
        </div>
      </div>
      <div className="table-panel">
        <table className="data-table stack">
          <thead><tr><th>{t('company')}</th><th>{t('created')}</th><th className="text-right">{t('users')}</th><th className="text-right">{t('projects')}</th><th className="text-right">{t('calculations')}</th><th>{t('billing')}</th><th>{t('status')}</th></tr></thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id}>
                <td className="row-title"><b>{c.name}</b><div className="note">{[c.vatNumber, c.city].filter(Boolean).join(' · ') || '—'}</div></td>
                <td data-label={t('created')}>{fd.date(c.createdAt)}</td>
                <td data-label={t('users')} className="num text-right">{c._count.users}</td>
                <td data-label={t('projects')} className="num text-right">{c._count.projects}</td>
                <td data-label={t('calculations')} className="num text-right">{c._count.calculations}</td>
                <td data-label={t('billing')}>
                  <div className="cell-stack">
                    <span className="note">{tb(`access.${c.access}`)}{c.seatPack !== 'NONE' ? ` · ${tb(`pack.${c.seatPack}`)}` : ''}</span>
                    {c.id === me.companyId ? null : (
                      <form action={setCompanyExemptAction}>
                        <input type="hidden" name="locale" value={lang} />
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="exempt" value={c.billingExempt ? '0' : '1'} />
                        <button type="submit" className="btn btn-sm">{c.billingExempt ? t('bill') : t('exempt')}</button>
                      </form>
                    )}
                  </div>
                </td>
                <td data-label={t('status')}>
                  {c.id === me.companyId ? <span className="status-pill ok">{t('active')}</span> : (
                    <form action={setCompanyActiveAction} className="flex items-center gap-2">
                      <input type="hidden" name="locale" value={lang} />
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="active" value={c.active ? '0' : '1'} />
                      <span className={`status-pill ${c.active ? 'ok' : 'fail'}`}>{c.active ? t('active') : t('inactive')}</span>
                      <button type="submit" className="btn btn-sm">{c.active ? t('deactivate') : t('activate')}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CreateCompanyForm />
    </main>
  );
}
