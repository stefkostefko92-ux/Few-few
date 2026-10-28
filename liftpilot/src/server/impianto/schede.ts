import 'server-only';
// The bar of an installation from its records (round 53, src/lib/impianto/schede.ts): the way from the survey to the
// documents (collegamentoImpianto: the surveys, the calculation, the Progetto's record, the sets), the Progetto's checks
// not met, the latest lift design and the drawing's draft (the simulation), the latest relazione tecnica issued and its
// draft. A tab's link is the page this user may open: the calculation's record, else its form for whoever calculates;
// the Progetto's form for whoever draws it (the machine room surveyed on the latest calculation when the intervention
// touches only the machine room), else its record; the reference survey for whoever sees the surveys, else the overview's
// list of them. Always the user's company: another company's installation is none.
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { RIGHT_OF_STEP, can } from '@/lib/rbac';
import { prossimoDi, schedeDi, type Prossimo, type Scheda, type SchedaKey } from '@/lib/impianto/schede';
import { outdated } from '../records';
import { RT_VERSIONS } from '../rt/queries';
import { collegamentoImpianto, type Collegamento } from '../collega/impianto';

export interface SchedeImpianto {
  id: string;
  nome: string;
  archiviato: boolean;
  schede: Scheda[];
  prossimo: Prossimo;
}

const PROJECT = { id: true, name: true, archivedAt: true, address: true, city: true, province: true, plantNumber: true } as const;

/** `c`: the way already read by the page (the overview), else read here. */
export async function schedeImpianto(user: SessionUser, projectId: string, c?: Collegamento): Promise<SchedeImpianto | null> {
  const p = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId }, select: PROJECT });
  if (!p) return null;
  const mine = { projectId: p.id, companyId: user.companyId };
  const [way, lift, drafts, rt, sets] = await Promise.all([
    c ?? collegamentoImpianto(user, p),
    prisma.liftDesign.findFirst({ where: mine, orderBy: { createdAt: 'desc' },
      select: { engineVersion: true, calculation: { select: { engineVersion: true } }, shaftDesign: { select: { engineVersion: true } } } }),
    prisma.formDraft.findMany({ where: { ...mine, scope: { in: ['lift', 'rt2'] } }, select: { scope: true } }),
    prisma.technicalReport.findFirst({ where: mine, orderBy: [{ year: 'desc' }, { seq: 'desc' }, { revision: 'desc' }], select: RT_VERSIONS }),
    prisma.drawingSet.count({ where: mine }),
  ]);
  const rec = way.progetto, verdict = !rec ? null : rec.kind === 'lift'
    ? await prisma.liftDesign.findFirst({ where: { id: rec.id, companyId: user.companyId }, select: { failCount: true } })
    : await prisma.roomDesign.findFirst({ where: { id: rec.id, companyId: user.companyId }, select: { failCount: true } });
  const live = !p.archivedAt, sees = can(user, 'rilievi:view');
  const calcola = can(user, RIGHT_OF_STEP.calcolo) && live, disegna = can(user, RIGHT_OF_STEP.progetto) && live;
  const base = `/app/projects/${p.id}`, ref = way.rilievi[0] ?? null;
  const record = rec ? `/app/${rec.kind === 'lift' ? 'lift-designs' : 'room-designs'}/${rec.id}` : null;
  const draw = !disegna ? null : way.disegno === 'locale' && way.base ? `/app/calculations/${way.base.id}/locale`
    : way.base ? `${base}/progetto?calc=${way.base.id}` : `${base}/progetto`;
  const href: Record<SchedaKey, string | null> = {
    panoramica: base,
    rilievo: sees && ref ? `/app/rilievi/${ref.dati.id}` : `${base}#rilievi`,
    calcolo: way.calcolo ? `/app/calculations/${way.calcolo.id}` : calcola ? `${base}/calc` : null,
    progetto: draw ?? record,
    simulazione: `${base}/simulazione`,
    relazione: `${base}/relazione-tecnica`,
    documenti: `${base}/documenti`,
  };
  const input = {
    passi: way.passi, tipo: way.tipo, disegno: way.disegno,
    progetto: verdict ? { fails: verdict.failCount } : null,
    simulazione: { salvato: lift ? { old: outdated.lift(lift) } : null, bozza: drafts.some((d) => d.scope === 'lift') },
    relazione: { emessa: rt ? { old: outdated.rt(rt) } : null, bozza: drafts.some((d) => d.scope === 'rt2') },
    href,
  };
  return { id: p.id, nome: p.name, archiviato: !live, schede: schedeDi(input), prossimo: prossimoDi(input, sets) };
}
