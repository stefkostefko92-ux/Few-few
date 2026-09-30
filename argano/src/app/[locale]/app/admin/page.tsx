import { getFormatter, getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { listCompanies } from '@/server/queries';
import { setCompanyActiveAction } from '@/server/user-actions';
import CreateCompanyForm from '@/components/CreateCompanyForm';

export async function generateMetadata() {
  const t = await getTranslations('admin');
  return { title: t('title') };
}

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireCapability(locale, 'platform:admin');
  const [t, format, companies, lang] = await Promise.all([getTranslations('admin'), getFormatter(), listCompanies(), getLocale()]);
  return (
    <main className="page">
      <div className="flex flex-col gap-1">
        <p className="eyebrow">Carbon Stealth VCC</p>
        <h1>{t('title')}</h1>
        <p className="lead">{t('lead')}</p>
      </div>
      <div className="panel overflow-x-auto p-0">
        <table className="data-table">
          <thead><tr><th>{t('company')}</th><th>{t('created')}</th><th className="text-right">{t('users')}</th><th className="text-right">{t('projects')}</th><th className="text-right">{t('calculations')}</th><th>{t('status')}</th></tr></thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id}>
                <td><b>{c.name}</b><div className="note">{[c.vatNumber, c.city].filter(Boolean).join(' · ') || '—'}</div></td>
                <td>{format.dateTime(c.createdAt, { dateStyle: 'medium' })}</td>
                <td className="num text-right">{c._count.users}</td>
                <td className="num text-right">{c._count.projects}</td>
                <td className="num text-right">{c._count.calculations}</td>
                <td>
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
