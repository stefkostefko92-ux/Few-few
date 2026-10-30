import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { idSchema } from '@/lib/schemas';
import { testoAiuto } from '@/lib/aiuto';
import { prisma } from '@/lib/db';
import { getLiftDesign, getProject, getRoomDesign, listDrawingSets } from '@/server/queries';
import { collegamentoImpianto } from '@/server/collega/impianto';
import Crumbs from '@/components/Crumbs';
import ImpiantoNav from '@/components/impianto/ImpiantoNav';
import AllegatiPanel from '@/components/allegati/AllegatiPanel';
import DocumentiProgetto from '@/components/documenti/DocumentiProgetto';
import DocumentiLocale from '@/components/documenti/DocumentiLocale';
import TavoleEmesse from '@/components/documenti/TavoleEmesse';
import { ConAiuto } from '@/components/shaft/Campo';
import AIUTO from '../../../../../../../messages/aiuto/documenti.json';

export async function generateMetadata() {
  const t = await getTranslations('documenti');
  return { title: t('titolo') };
}

// «Tavole e documenti» of an installation (round 53: everything that is downloaded, issued or ordered, on one page of its
// own): from the installation's Progetto — the lift design, or the machine room surveyed when the intervention touches
// only the machine room (collegamentoImpianto) — or the saved design asked for (?design=, a lift design or a machine room
// of this installation); the drawing sets issued, the installation's uploaded files. Nothing saved yet: what is needed and
// the way to the Progetto. Whoever sees the installation reads it; each document keeps its own right.
export default async function DocumentiPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ design?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:view');
  const p = await getProject(user, id);
  if (!p) notFound();
  const asked = (await searchParams).design, design = asked === undefined ? null : idSchema.safeParse(asked);
  if (design && !design.success) notFound();
  const [t, tp, c, sets] = await Promise.all([getTranslations('documenti'), getTranslations('projects'), collegamentoImpianto(user, p), listDrawingSets(user, p.id)]);
  // the record: the one asked for (a lift design first, else a machine room), else the installation's Progetto
  const mine = { projectId: p.id, companyId: user.companyId };
  const chosen = design?.success ? (await prisma.liftDesign.findFirst({ where: { ...mine, id: design.data }, select: { id: true } }) ? { kind: 'lift' as const, id: design.data }
    : await prisma.roomDesign.findFirst({ where: { ...mine, id: design.data }, select: { id: true } }) ? { kind: 'room' as const, id: design.data } : null) : c.progetto;
  if (design && !chosen) notFound();
  const lift = chosen?.kind === 'lift' ? await getLiftDesign(user, chosen.id) : null;
  const room = chosen?.kind === 'room' && can(user, 'calc:view') ? await getRoomDesign(user, chosen.id) : null;
  const fd = dateFormat(locale), live = !p.archivedAt, disegna = can(user, 'progetto:edit') && live;
  const record = lift ? `/app/lift-designs/${lift.id}` : room ? `/app/room-designs/${room.id}` : null;
  const sets$ = <TavoleEmesse projectId={p.id} sets={sets} locale={locale} />;
  const files = <AllegatiPanel user={user} projectId={p.id} live={live} locale={locale} headingId="doc-file" />;
  return (
    <main className="page page-wide">
      <Crumbs items={[{ href: '/app/impianti', label: tp('title') }, { href: `/app/projects/${p.id}`, label: p.name }, { label: t('titolo') }]} />
      <ImpiantoNav user={user} projectId={p.id} corrente="documenti" c={c} />
      <div className="page-head">
        <div className="titles">
          <ConAiuto aiuto={testoAiuto(AIUTO, 'pagina')} nome={t('titolo')} block><h1>{t('titolo')}</h1></ConAiuto>
          <p className="lead">
            {lift ? t('daProgetto', { date: fd.dateTime(lift.createdAt) }) : room ? t('daLocale', { date: fd.dateTime(room.createdAt) }) : t('lead')}
            {record ? <> · <Link href={record}>{t('apriRecord')}</Link></> : null}
          </p>
        </div>
      </div>
      {lift ? <DocumentiProgetto user={user} d={lift} locale={locale} sets={sets$} files={files} />
        : room ? <DocumentiLocale user={user} r={room} locale={locale} sets={sets$} files={files} /> : (
          <>
            <section className="panel items-start" aria-labelledby="doc-vuoto">
              <h2 id="doc-vuoto">{t('vuoto')}</h2>
              <p className="note">{t(c.disegno === 'locale' ? 'vuotoLocale' : 'vuotoLead')}</p>
              {disegna && c.base ? <Link className="btn btn-primary" href={c.disegno === 'locale' ? `/app/calculations/${c.base.id}/locale` : `/app/projects/${p.id}/progetto?calc=${c.base.id}`}>{t('apriProgetto')}</Link> : null}
            </section>
            {sets.length ? <section className="panel doc-blocco">{sets$}</section> : null}
            {files}
          </>
        )}
    </main>
  );
}
