import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { getCompanyLogo } from '@/server/queries';
import LogoForm from '@/components/tavole/LogoForm';

export async function generateMetadata() {
  const t = await getTranslations('tavole');
  return { title: t('companyTitle') };
}

// The company as the drawing sets show it: its logo in the title block.
export default async function CompanyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'company:edit');
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
        <LogoForm hasLogo={logo !== null} />
      </section>
    </main>
  );
}
