import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { fmt } from '@/lib/rilievi/fmt';
import { schedaTitle } from '@/lib/rilievi/format';
import type { RilieviT } from '@/lib/rilievi/t';
import { printView, sheetTabTitle, sheetToShow } from '@/server/rilievi/pages';
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

// The sheet on A4 paper (rilievi print.ejs + print-head.css, commit ae6329cb6): on top the company's logo (the drawing
// sets' one; without a logo its name) and, on the right, the day and who filled it in, large; the title in the middle;
// under it the address on the left (bold, as big as the title) and the «Buono di riferimento» on the right; the plate
// (matricola, number, specs — the address is in the head). «Impianto» is not printed as a section: all of it is in the
// head and the plate. Then the sections in the company's order with every option as a box, ticked or not, the
// measurements per stop as a table; what is filled in the suppliers' modules only when the sheet asks for it
// («Includi i dati dei moduli…»); the footer with who printed it and when. White paper on the screen too, with the bar
// to print it, download its PDF or go back; on paper only the sheet.
export default async function PrintRilievoPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'rilievi:view');
  const scheda = await sheetToShow(user, id);
  if (!scheda) notFound();
  const [t, tn, logo] = await Promise.all([getTranslations('rilievi'), getTranslations('nav'), companyLogo(scheda.companyId)]);
  const rt = t as unknown as RilieviT;
  const { sections, printed, riepilogo } = printView(scheda, rt);
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
          <div className="rv-paper-top">
            <div className="rv-paper-brand">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- the company's own logo from the database, as on the company page
                <img className="rv-paper-logo" src={`data:${logo.mime};base64,${Buffer.from(logo.data).toString('base64')}`}
                  alt={t('print.logoAlt', { name: scheda.company.name })} width={logo.width} height={logo.height} />
              ) : <span className="rv-paper-company">{scheda.company.name}</span>}
            </div>
            <div className="rv-paper-meta">
              <div><strong>{t('scheda.field.data')}: {fmt.day(scheda.data)}</strong></div>
              <div className="rv-paper-by"><span>{t('scheda.compiledBy')}</span><strong>{scheda.createdBy?.name ?? '—'}</strong></div>
              {edited ? <div>{t('scheda.meta.updated', { name: scheda.updatedBy?.name ?? '—', at: fmt.dateTime(scheda.updatedAt) })}</div> : null}
            </div>
          </div>
          <h1 className="rv-paper-title">{t('scheda.title')}</h1>
          <div className="rv-paper-sub">
            <p className={scheda.indirizzo ? 'rv-paper-address' : 'rv-paper-address none'}>{scheda.indirizzo || t('scheda.noAddress')}</p>
            <p className="rv-paper-buono"><span>{t('scheda.buonoRiferimento')}</span><strong>{scheda.buonoLavoro || '—'}</strong></p>
          </div>
        </header>
        <Plate scheda={scheda} sections={sections} t={rt} withAddress={false} />
        {printed.map((section) => (
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
        {/* what is filled in the suppliers' modules — only when the sheet asks for it (riepilogoOrdini) */}
        {riepilogo.map((modulo) => (
          <section key={modulo.nome} className="rv-paper-sec">
            <h2>{modulo.nome}</h2>
            <dl className="rv-paper-grid">
              {modulo.gruppi.map((g, i) => (
                <div key={i} className="rv-paper-cell wide">
                  <dt>{g.titolo}</dt>
                  <dd>
                    {g.spunte.length ? (
                      <span className="rv-opts-p">
                        {g.spunte.map((label, j) => (
                          <span key={j} className="rv-opt on"><span className="rv-opt-box" aria-hidden="true" />{label}<span className="sr-only"> ✓</span></span>
                        ))}
                      </span>
                    ) : null}
                    {g.testi.length ? (
                      <span className="rv-pairs">
                        {g.testi.map((pair, j) => <span key={j}>{pair.label}: <strong>{pair.value}</strong></span>)}
                      </span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <footer className="rv-paper-foot">
          {/* the owner's English credit, marked as English for screen readers (the text stays the original's) */}
          {t('pdf.generated', { at: fmt.dateTime(new Date()), name: user.name })} — <span lang="en">Created and Designed by Carbon Stealth VCC</span> — carbonstealth.eu
        </footer>
      </article>
    </main>
  );
}
