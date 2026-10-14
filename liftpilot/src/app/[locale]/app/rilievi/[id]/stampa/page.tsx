import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { fmt } from '@/lib/rilievi/fmt';
import { displaySections, schedaTitle } from '@/lib/rilievi/format';
import type { RilieviT } from '@/lib/rilievi/t';
import { sheetTabTitle, sheetToShow } from '@/server/rilievi/pages';
import { companyLogo } from '@/server/rilievi/queries';
import Crumbs from '@/components/Crumbs';
import Icon from '@/components/Icon';
import { AutoPrint, PrintButton } from '@/components/rilievi/PrintTools';
import { MisureTable, Plate } from '@/components/rilievi/parts';

// the tab (and «Salva come PDF») is named after the sheet, as in rilievi
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const [title, t] = await Promise.all([params.then((p) => sheetTabTitle(p.id)), getTranslations('rilievi')]);
  return { title: title ?? t('scheda.title') };
}

// The sheet on A4 paper (rilievi print.ejs): the company's logo (the drawing sets' one) top left, the title and the
// company, on the right the day and who filled it in, large; the plate; the sections with every option as a box, ticked
// or not, the measurements per stop as a table; the footer with who printed it and when. White paper on the screen too,
// with the bar to print it, download its PDF or go back; on paper only the sheet. The suppliers' modules never appear
// here (they have their own PDF).
export default async function PrintRilievoPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'rilievi:view');
  const scheda = await sheetToShow(user, id);
  if (!scheda) notFound();
  const [t, tn, logo] = await Promise.all([getTranslations('rilievi'), getTranslations('nav'), companyLogo(scheda.companyId)]);
  const rt = t as unknown as RilieviT;
  const sections = displaySections(scheda, rt);
  const title = schedaTitle(scheda, rt);
  const edited = scheda.updatedBy && scheda.updatedAt.getTime() - scheda.createdAt.getTime() > 1000;
  return (
    <main className="page rv-print-page">
      <AutoPrint />
      <Crumbs items={[{ href: '/app/rilievi', label: tn('rilievi') }, { href: `/app/rilievi/${scheda.id}`, label: title }, { label: t('scheda.actions.print') }]} />
      <div className="rv-print-bar">
        <PrintButton label={t('scheda.actions.print')} />
        <a className="btn" href={`/api/rilievi/${scheda.id}/pdf`}><Icon name="download" size={18} />{t('scheda.actions.pdf')}</a>
        <Link className="btn" href={`/app/rilievi/${scheda.id}`}><Icon name="arrow-left" size={18} />{t('print.back')}</Link>
      </div>
      <article className="rv-paper">
        <header className="rv-paper-head">
          <div className="rv-paper-id">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- the company's own logo from the database, as on the company page
              <img className="rv-paper-logo" src={`data:${logo.mime};base64,${Buffer.from(logo.data).toString('base64')}`}
                alt={t('print.logoAlt', { name: scheda.company.name })} width={logo.width} height={logo.height} />
            ) : null}
            <h1 className="rv-paper-title">{t('scheda.title')}</h1>
            <div className="rv-paper-company">{scheda.company.name}</div>
          </div>
          <div className="rv-paper-meta">
            <div><strong>{t('scheda.field.data')}: {fmt.day(scheda.data)}</strong></div>
            <div className="rv-paper-by"><span>{t('scheda.compiledBy')}</span><strong>{scheda.createdBy?.name ?? '—'}</strong></div>
            {edited ? <div>{t('scheda.meta.updated', { name: scheda.updatedBy?.name ?? '—', at: fmt.dateTime(scheda.updatedAt) })}</div> : null}
          </div>
        </header>
        <Plate scheda={scheda} sections={sections} t={rt} />
        {sections.map((section) => (
          <section key={section.key} className="rv-paper-sec">
            <h2>{section.title}</h2>
            <dl className="rv-paper-grid">
              {section.fields.map((f) => (
                <div key={f.key} className={f.wide || (f.options && f.kind !== 'yesno') ? 'rv-paper-cell wide' : 'rv-paper-cell'}>
                  <dt>{f.label}</dt>
                  {f.options ? (
                    <dd>
                      <span className="rv-opts-p">
                        {f.options.map((o) => (
                          <span key={o.value} className={o.checked ? 'rv-opt on' : 'rv-opt'}>
                            <span className="rv-opt-box" aria-hidden="true" />{o.label}{o.checked ? <span className="sr-only"> ✓</span> : null}
                          </span>
                        ))}
                      </span>
                      {/* the line break after the table is rilievi's (its template's newline under pre-line): the same blank
                          line on paper, so the pages break where rilievi's do */}
                      {f.table ? <><MisureTable table={f.table} className="rv-ptable" />{'\n'}</> : null}
                    </dd>
                  ) : f.value ? <dd>{f.value}</dd> : <dd className="empty">—</dd>}
                </div>
              ))}
            </dl>
          </section>
        ))}
        <footer className="rv-paper-foot">
          {t('pdf.generated', { at: fmt.dateTime(new Date()), name: user.name })} — Created and Designed by Carbon Stealth VCC — carbonstealth.eu
        </footer>
      </article>
    </main>
  );
}
