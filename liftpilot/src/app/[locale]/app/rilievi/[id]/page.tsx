import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { fmt } from '@/lib/rilievi/fmt';
import { flashOf } from '@/lib/rilievi/form-help';
import { schedaTitle, type DisplayField } from '@/lib/rilievi/format';
import type { RilieviT } from '@/lib/rilievi/t';
import { restoreRilievoAction } from '@/server/rilievi/actions';
import { sheetTabTitle, sheetToShow, sheetView } from '@/server/rilievi/pages';
import Crumbs from '@/components/Crumbs';
import Icon from '@/components/Icon';
import ActionButton from '@/components/rilievi/ActionButton';
import { DiffItem } from '@/components/rilievi/DiffItem';
import Flash from '@/components/rilievi/Flash';
import RilieviHead from '@/components/rilievi/RilieviHead';
import SectionIndex from '@/components/rilievi/SectionIndex';
import { MisureTable, Plate } from '@/components/rilievi/parts';
import LinkPanel from '@/components/collega/LinkPanel';
import { searchQuery } from '@/lib/search-query';

type SP = Promise<Record<string, string | string[] | undefined>>;

// the tab (and «Salva come PDF») is named after the sheet, as in rilievi
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const [title, t] = await Promise.all([params.then((p) => sheetTabTitle(p.id)), getTranslations('rilievi')]);
  return { title: title ?? t('scheda.title') };
}

/** A filled supplier's module under its question: its own PDF, to save or to print (never in the sheet's). */
function ModuloLinks({ id, modulo, t }: { id: string; modulo: NonNullable<DisplayField['modulo']>; t: RilieviT }) {
  const href = `/api/rilievi/${id}/${modulo.path}`;
  return (
    <span className="rv-modulo-links">
      <span>{modulo.nome}</span>
      <a className="btn btn-sm" href={href}><Icon name="download" size={16} />{t('ordini.download')}</a>
      <a className="btn btn-sm" href={`${href}?inline=1`} target="_blank" rel="noopener"><Icon name="printer" size={16} />{t('ordini.print')}</a>
    </span>
  );
}

// A survey sheet (rilievi show.ejs, commit 988f3cf37): its title (the lift's number, else the matricola, else the
// address), the day of the survey, the actions the user may take; the data the sheet and its modules say differently
// (saved with the confirmation, or from before the check); the plate; the sections in the company's order with only the
// fields that apply, the measurements per stop as a table, the suppliers' modules as links to their PDFs; who wrote it
// and who changed it last. A sheet in
// the trash is shown only to whoever manages the trash, with the banner to restore it or delete it for good. Another
// company's or an unknown sheet: not found. Over the sheet, apart from it (round 44): the survey's link to its
// installation (components/collega/LinkPanel.tsx) — never in the sheet's content, print or PDF.
export default async function RilievoPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: SP }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'rilievi:view');
  const scheda = await sheetToShow(user, id);
  if (!scheda) notFound();
  const [t, tn] = await Promise.all([getTranslations('rilievi'), getTranslations('nav')]);
  const rt = t as unknown as RilieviT;
  const { sections, discrepanze } = sheetView(scheda, rt);
  const title = schedaTitle(scheda, rt);
  const sp = await searchParams, flash = flashOf(sp.ok);
  const deleted = scheda.deletedAt !== null;
  const actions = (
    <>
      {!deleted && can(user, 'rilievi:edit') ? <Link className="btn btn-primary" href={`/app/rilievi/${scheda.id}/modifica`}>{t('scheda.actions.edit')}</Link> : null}
      <Link className="btn" href={`/app/rilievi/${scheda.id}/stampa?auto=1`}><Icon name="printer" size={18} />{t('scheda.actions.print')}</Link>
      <a className="btn" href={`/api/rilievi/${scheda.id}/pdf`}><Icon name="download" size={18} />{t('scheda.actions.pdf')}</a>
      {!deleted && can(user, 'rilievi:trash') ? <Link className="btn btn-ghost" href={`/app/rilievi/${scheda.id}/elimina`}><Icon name="trash-2" size={18} />{t('scheda.actions.delete')}</Link> : null}
    </>
  );
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app', label: tn('rilievi') }, { href: '/app/rilievi', label: tn('rilieviAll') }, ...(deleted ? [{ href: '/app/rilievi/cestino', label: t('trash.title') }] : []), { label: title }]} />
      <RilieviHead back={{ href: '/app/rilievi', label: t('schede.back') }} title={title} lead={t('scheda.dateLine', { date: fmt.day(scheda.data) })} actions={actions} />
      {flash ? <Flash text={t(`flash.${flash}`)} /> : null}
      <LinkPanel user={user} scheda={scheda} cerca={searchQuery(sp.impianto)} flash={sp.lk} />
      <div className="rv-with-index">
        <SectionIndex label={t('scheda.index')} titles={sections.map((s) => ({ key: s.key, title: s.title }))} />
        <div className="rv-sheet">
          {scheda.deletedAt ? (
            <div className="alert alert-warn rv-trashed" role="status">
              <span>{t('trash.banner', { at: fmt.dateTime(scheda.deletedAt), name: scheda.deletedBy?.name ?? '—' })}</span>
              {can(user, 'rilievi:trash-manage') ? (
                <span className="rv-acts">
                  <ActionButton action={restoreRilievoAction} id={scheda.id} label={t('trash.restore')} icon="refresh-cw" variant="btn btn-sm" />
                  <Link className="btn btn-sm btn-danger" href={`/app/rilievi/cestino/${scheda.id}/elimina`}>{t('trash.purge')}</Link>
                </span>
              ) : null}
            </div>
          ) : null}
          {discrepanze.length ? (
            <div className="rv-diffnote">
              <p><strong>{t('collegati.banner')}</strong></p>
              <ul>{discrepanze.map((d) => <DiffItem key={d.key} d={d} t={rt} />)}</ul>
            </div>
          ) : null}
          <Plate scheda={scheda} sections={sections} t={rt} />
          {sections.map((section, index) => (
            <section key={section.key} className="rv-sec" id={`s-${section.key}`} aria-labelledby={`h-${section.key}`}>
              <h2 className="rv-sec-title" id={`h-${section.key}`}><span className="rv-secnum" aria-hidden="true">{index + 1}</span>{section.title}</h2>
              <dl className="rv-kv">
                {section.fields.map((f) => (
                  <div key={f.key} className={f.wide ? 'wide' : undefined}>
                    <dt>{f.label}</dt>{' '}
                    {f.value ? (
                      <dd>
                        {f.value}
                        {f.table ? <MisureTable table={f.table} /> : null}
                        {f.modulo ? <ModuloLinks id={scheda.id} modulo={f.modulo} t={rt} /> : null}
                      </dd>
                    ) : <dd className="empty">—</dd>}
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <p className="rv-meta">
            <span>{t('scheda.meta.created', { name: scheda.createdBy?.name ?? '—', at: fmt.dateTime(scheda.createdAt) })}</span>
            <span>{t('scheda.meta.updated', { name: scheda.updatedBy?.name ?? '—', at: fmt.dateTime(scheda.updatedAt) })}</span>
          </p>
        </div>
      </div>
    </main>
  );
}
