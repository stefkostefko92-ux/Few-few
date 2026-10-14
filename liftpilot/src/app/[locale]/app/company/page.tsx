import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { denied, requireUser } from '@/lib/auth';
import { companyPageView } from '@/lib/company-page';
import { getCompanyLogo } from '@/server/queries';
import { sezioniSetting } from '@/server/rilievi/sezioni';
import LogoForm from '@/components/tavole/LogoForm';
import AccountHead, { PanelHead } from '@/components/AccountHead';
import Icon from '@/components/Icon';
import SezioniForm from '@/components/rilievi/SezioniForm';
import '@/app/rilievi-sezioni.css';

export async function generateMetadata() {
  const t = await getTranslations('tavole');
  return { title: t('companyTitle') };
}

// The company as the drawing sets show it — its logo in the title block, changed only when the company is not read-only —,
// the order of the survey sheet's sections (Rilievi: the form, the sheet's page, the print and the PDF follow it; set by
// whoever has 'company:edit', as rilievi's company admin set it on /impostazioni) and all its data in one JSON file
// (always: also to leave the service). The owner's; a Capotecnico's when the company gives one of the two (round 42) —
// held, read-only mode or not (src/lib/company-page.ts): the page shows what the rights allow, and why the logo cannot be
// changed (the company is read-only, or the role lacks the right). The order of the sections is there only for a role
// holding 'company:edit' (in read-only mode shown, unchanged).
export default async function CompanyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const view = companyPageView(user);
  if (!view) denied(locale, user, 'company:export');
  const [t, tr, c, sezioni] = await Promise.all([getTranslations('tavole'), getTranslations('rilievi'), getCompanyLogo(user),
    view.sezioni ? sezioniSetting(user.companyId) : null]);
  const logo = c?.logo ?? null;
  return (
    <main className="page">
      <AccountHead area="company" title={`${t('companyTitle')} · ${c?.name ?? user.companyName}`} />
      <section className="panel" aria-labelledby="logo-h">
        <PanelHead icon="file-image" id="logo-h">{t('logoTitle')}</PanelHead>
        <p className="note">{t('logoHint')}</p>
        {logo ? (
          <figure className="logo-preview">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URI of the company's own logo, no optimisation to gain */}
            <img src={`data:${logo.mime};base64,${Buffer.from(logo.data).toString('base64')}`} alt={t('logoCurrent')} width={logo.width} height={logo.height} />
            <figcaption className="note">{t('logoCurrent')} · {logo.width} × {logo.height} px</figcaption>
          </figure>
        ) : <p>{t('logoNone')}</p>}
        {view.logo === 'form' ? <LogoForm hasLogo={logo !== null} />
          : <p className="note">{t(view.logo === 'readOnly' ? 'logoReadOnly' : 'logoNoRight')}</p>}
      </section>
      {sezioni ? <section className="panel" aria-labelledby="sezioni-h">
        <PanelHead icon="list-tree" id="sezioni-h">{tr('impostazioni.sezioni.title')}</PanelHead>
        <p className="note">{tr('impostazioni.sezioni.text')}</p>
        <SezioniForm fisse={sezioni.fisse} ordine={sezioni.ordine} canEdit={view.sezioni === 'edit'} />
      </section> : null}
      {view.exports ? <section className="panel" aria-labelledby="export-h">
        <PanelHead icon="database" id="export-h">{t('exportTitle')}</PanelHead>
        <p className="note">{t('exportText')}</p>
        <p><a className="btn" href="/api/company/export" download><Icon name="download" size={18} />{t('exportButton')}</a></p>
        <p className="note"><Link href="/data" target="_blank">{t('exportFormat')}</Link></p>
      </section> : null}
    </main>
  );
}
