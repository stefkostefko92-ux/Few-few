import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formValuesSchema } from '@/lib/calc-input';
import { collaudoReadSchema } from '@/lib/lift-input';
import { idSchema } from '@/lib/schemas';
import { blankCalc } from '@/lib/calc-blank';
import { calcDraftSchema } from '@/lib/draft-input';
import { dateFormat } from '@/lib/dates';
import { getProject } from '@/server/queries';
import { readDraft } from '@/server/drafts';
import Calculator from '@/components/calc/Calculator';
import Crumbs from '@/components/Crumbs';
import RefreshNotice from '@/components/RefreshNotice';
import RilievoAvviso from '@/components/collega/RilievoAvviso';
import { avvioCalc } from '@/server/collega/forms';
import { openedByRefresh } from '@/lib/refresh-form';

export async function generateMetadata() {
  const t = await getTranslations('calculations');
  return { title: t('newTitle') };
}

// The calculator of a machine replacement: it starts from the values of the chosen saved calculation (?from=), else
// from the form's draft, else from the latest calculation of the project, else empty (src/lib/calc-blank.ts): nothing of
// the installation or the machines filled in. A whole project has one form, which saves its calculation with it. Opened
// by «Aggiorna con il software attuale» on a calculation that no longer saves as it was (&aggiorna=1), it says so on top.
// With a survey linked to the installation (round 44) a new calculation or its draft takes the measured values where
// still empty, marked «dal rilievo»; «usa il valore del rilievo» (&usa=<parametro>) puts one in on purpose, said on top —
// for whoever sees the surveys (src/server/collega/forms.ts).
export default async function CalcPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ from?: string; aggiorna?: string; usa?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'calc:create');
  const p = await getProject(user, id);
  if (!p || p.archivedAt) notFound();
  if (p.kind === 'FULL') redirect(`/${locale}/app/projects/${p.id}/progetto`);
  const sp = await searchParams, from = idSchema.safeParse(sp.from);
  const draft = from.success ? null : await readDraft(user, p.id, 'calc', calcDraftSchema);
  const source = draft ? null : await prisma.calculation.findFirst({
    where: { projectId: p.id, companyId: user.companyId, ...(from.success ? { id: from.data } : {}) },
    orderBy: { createdAt: 'desc' },
    select: { inputs: true, collaudo: true },
  });
  const parsed = source ? formValuesSchema.safeParse(source.inputs) : null, chosen = source?.collaudo ? collaudoReadSchema.safeParse(source.collaudo) : null;
  // the survey seeds a new calculation (also over the software's standards) or its draft (only what is still empty),
  // never a saved one opened again
  const mode = from.success ? null : draft ? 'draft' : parsed?.success ? null : 'new';
  const avvio = await avvioCalc(user, p.id, draft ? draft.data.values : parsed?.success ? parsed.data : blankCalc(), mode, sp.usa);
  const initial = avvio.start;
  const collaudo = draft ? draft.data.collaudo : chosen?.success ? chosen.data : null;
  const [t, tp] = await Promise.all([getTranslations('calculations'), getTranslations('projects')]);
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app/impianti', label: tp('title') }, { href: `/app/projects/${p.id}`, label: p.name }, { label: t('newTitle') }]} />
      <div className="page-head">
        <div className="titles">
          <h1>{t('newTitle')}</h1>
          <p className="lead">{t('newLead')}</p>
        </div>
      </div>
      {from.success && openedByRefresh(sp) ? <RefreshNotice kind="calc" /> : null}
      {avvio.rilievo ? <RilievoAvviso rilievo={avvio.rilievo} usa={avvio.usa} /> : null}
      <Calculator key={sp.usa ?? 'start'} projectId={p.id} initial={initial} preset={null} brand={user.companyName} collaudo={collaudo} origine={avvio.origine}
        draft={{ projectId: p.id, scope: 'calc', resumed: draft ? dateFormat(locale).dateTime(new Date(draft.at)) : null }} />
    </main>
  );
}
