import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { idSchema } from '@/lib/schemas';
import { pitchesOf } from '@/lib/plant';
import { testoAiuto } from '@/lib/aiuto';
import { getProject } from '@/server/queries';
import { simulazioneDi } from '@/server/simulazione';
import Crumbs from '@/components/Crumbs';
import ImpiantoNav from '@/components/impianto/ImpiantoNav';
import SimulazioneVista from '@/components/simulazione/SimulazioneVista';
import { ConAiuto } from '@/components/shaft/Campo';
import AIUTO from '../../../../../../../messages/aiuto/progetto.json';

export async function generateMetadata() {
  const t = await getTranslations('simulazione');
  return { title: t('titolo') };
}

// The Simulazione of an installation (round 53: its own page, out of the Progetto and the saved design's): the saved lift
// design — the one asked for (?design=), else the latest — or the Progetto's draft (?fonte=bozza, or when nothing is saved
// yet), derived again in the browser; the way between the two when both are there; with nothing to simulate, what is
// missing and the way to the Progetto. Opened from a check (?verifica=), that check's run plays at once. Read only: whoever
// sees the installation.
export default async function SimulazionePage({ params, searchParams }: {
  params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ design?: string; fonte?: string; verifica?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:view');
  const p = await getProject(user, id);
  if (!p) notFound();
  const sp = await searchParams, design = sp.design === undefined ? null : idSchema.safeParse(sp.design);
  if (design && !design.success) notFound();
  const sim = await simulazioneDi(user, p.id, { design: design?.data, bozza: sp.fonte === 'bozza' });
  if (design && !sim.salvato) notFound();
  const [t, tp] = await Promise.all([getTranslations('simulazione'), getTranslations('projects')]);
  const fd = dateFormat(locale), verifica = sp.verifica && /^[a-z0-9_]{1,40}$/i.test(sp.verifica) ? sp.verifica : null;
  const base = `/app/projects/${p.id}/simulazione`, disegna = can(user, 'progetto:edit') && !p.archivedAt;
  const inputs = sim.fonte === 'bozza' && sim.bozza && 'inputs' in sim.bozza ? sim.bozza.inputs : sim.fonte === 'salvato' && sim.salvato ? sim.salvato.inputs : null;
  const salvatoNome = sim.salvato ? `${sim.salvato.label ? `${sim.salvato.label} · ` : ''}${fd.dateTime(sim.salvato.createdAt)}` : null;
  return (
    <main className="page page-wide">
      <Crumbs items={[{ href: '/app/impianti', label: tp('title') }, { href: `/app/projects/${p.id}`, label: p.name }, { label: t('titolo') }]} />
      <ImpiantoNav user={user} projectId={p.id} corrente="simulazione" />
      <div className="page-head">
        <div className="titles">
          <ConAiuto aiuto={testoAiuto(AIUTO, 'simulazione')} nome={t('titolo')} block><h1>{t('titolo')}</h1></ConAiuto>
          <p className="lead">{t('lead')}</p>
        </div>
        {disegna ? <div className="actions"><Link className="btn" href={`/app/projects/${p.id}/progetto`}>{t('modifica')}</Link></div> : null}
      </div>
      {/* what is simulated, and the way to the other one */}
      {sim.salvato || sim.bozza ? (
        <nav className="seg-row sim-fonte" aria-label={t('fonte')}>
          {sim.salvato ? (
            <Link href={design?.success ? `${base}?design=${design.data}` : base} aria-current={sim.fonte === 'salvato' ? 'true' : undefined}>
              {t('salvato', { nome: salvatoNome ?? '' })}
            </Link>
          ) : null}
          {sim.bozza ? (
            'inputs' in sim.bozza
              ? <Link href={`${base}?fonte=bozza`} aria-current={sim.fonte === 'bozza' ? 'true' : undefined}>{t('bozza', { at: fd.dateTime(new Date(sim.bozza.at)) })}</Link>
              : <span className="note">{'manca' in sim.bozza ? t('bozzaManca', { n: sim.bozza.manca }) : t('bozzaSenzaCalcolo')}</span>
          ) : null}
        </nav>
      ) : null}
      {sim.fonte === 'salvato' && sim.salvato?.vecchio ? <p className="alert alert-warn" role="status">{t('vecchio')}</p> : null}
      {inputs ? <SimulazioneVista inputs={inputs} pitches={pitchesOf(p.plant)} verifica={verifica} /> : (
        <section className="panel items-start" aria-labelledby="sim-vuota">
          <h2 id="sim-vuota">{t('vuota')}</h2>
          <p className="note">{t(sim.bozza ? 'vuotaBozza' : 'vuotaLead')}</p>
          {disegna ? <Link className="btn btn-primary" href={`/app/projects/${p.id}/progetto`}>{t('apriProgetto')}</Link> : null}
        </section>
      )}
    </main>
  );
}
