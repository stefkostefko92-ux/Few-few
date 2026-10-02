import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { getCompanyLogo } from '@/server/queries';
import LogoForm from '@/components/tavole/LogoForm';

export async function generateMetadata() {
  const t = await getTranslations('tavole');
  return { title: t('companyTitle') };
}

// The company as the drawing sets show it — its logo in the title block, changed only when the company is not read-only —
// and all its data in one JSON file (always: also to leave the service).
export default async function CompanyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'company:export');
  const [t, c] = await Promise.all([getTranslations('tavole'), getCompanyLogo(user)]);
  const logo = c?.logo ?? null;
  return (
    <main className="page">
      <div className="page-head">
        <div className="titles">
          <h1>{t('companyTitle')} · {c?.name ?? user.companyName}</h1>
        </div>
      </div>
      <section className="panel">
        <h2>{t('logoTitle')}</h2>
        <p className="note">{t('logoHint')}</p>
        {logo ? (
          <figure className="logo-preview">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URI of the company's own logo, no optimisation to gain */}
            <img src={`data:${logo.mime};base64,${Buffer.from(logo.data).toString('base64')}`} alt={t('logoCurrent')} width={logo.width} height={logo.height} />
            <figcaption className="note">{t('logoCurrent')} · {logo.width} × {logo.height} px</figcaption>
          </figure>
        ) : <p>{t('logoNone')}</p>}
        {can(user, 'company:edit') ? <LogoForm hasLogo={logo !== null} /> : <p className="note">{t('logoReadOnly')}</p>}
      </section>
      <section className="panel" aria-labelledby="export-h">
        <h2 id="export-h">{t('exportTitle')}</h2>
        <p className="note">{t('exportText')}</p>
        <p><a className="btn" href="/api/company/export" download>{t('exportButton')}</a></p>
      </section>
    </main>
  );
}
