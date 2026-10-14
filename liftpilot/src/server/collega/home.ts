import 'server-only';
// The Rilievi home's figures (round 44), from the company's records only, defined so that each says what it counts:
//   * «Rilievi senza impianto» — the surveys out of the trash not linked to any installation;
//   * «Impianti con differenze» — the active installations whose reference survey and records disagree on what exists on
//     site (the comparison's STATO DI FATTO rows marked as a probable error, src/lib/collega/confronto.ts);
//   * «Calcoli da aggiornare» — the active installations whose latest calculation the running engines no longer reproduce,
//     or which is older than the last change of the reference survey (src/lib/collega/passi.ts) — each installation once.
// The recent surveys come with their link. What a role may not see is not read (the page passes its rights).
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { sintesi } from '@/lib/collega/confronto';
import { calcoloDaAggiornare } from '@/lib/collega/passi';
import { RILIEVO_SELECT, rilievoDati, type RilievoDati } from '@/lib/collega/rilievo';
import { outdated } from '../records';
import { CALC_SELECT, LIFT_SELECT, righeDi } from './impianto';

/** At most this many active installations with surveys are compared for the figures. */
const MAX_LINKED = 300;

export async function recentRilievi(user: SessionUser, take = 8) {
  return prisma.scheda.findMany({
    where: { companyId: user.companyId, deletedAt: null }, orderBy: [{ data: 'desc' }, { createdAt: 'desc' }], take,
    select: { id: true, data: true, indirizzo: true, matricola: true, numeroImpianto: true, marca: true, tipoImpianto: true,
      project: { select: { id: true, name: true, archivedAt: true } } },
  });
}

export function rilieviCounts(user: SessionUser) {
  const where = { companyId: user.companyId, deletedAt: null };
  return Promise.all([prisma.scheda.count({ where }), prisma.scheda.count({ where: { ...where, projectId: null } })])
    .then(([totali, senzaImpianto]) => ({ totali, senzaImpianto }));
}

interface LatestRow {
  id: string;
  calcId: string | null;
  calcAt: Date | null;
  cEngine: string | null;
  cShaft: string | null;
  cLift: string | null;
  liftId: string | null;
}

export interface ImpiantiFigures {
  /** active installations with a survey whose comparison finds a probable error */
  conDifferenze: number;
  /** active installations whose latest calculation is «da aggiornare», and why (one may have both reasons) */
  daAggiornare: number;
  perSoftware: number;
  perRilievo: number;
}

export async function impiantiFigures(user: SessionUser): Promise<ImpiantiFigures> {
  const companyId = user.companyId;
  // every active installation's latest calculation (with the versions that make it «da aggiornare») and latest design
  const latest = await prisma.$queryRaw<LatestRow[]>`
    SELECT p."id", c."id" AS "calcId", c."createdAt" AS "calcAt", c."engineVersion" AS "cEngine", cs."engineVersion" AS "cShaft",
      cl."engineVersion" AS "cLift", d."id" AS "liftId"
    FROM "Project" p
    LEFT JOIN LATERAL (
      SELECT "id", "createdAt", "engineVersion", "shaftDesignId" FROM "Calculation" WHERE "projectId" = p."id" ORDER BY "createdAt" DESC LIMIT 1
    ) c ON true
    LEFT JOIN "ShaftDesign" cs ON cs."id" = c."shaftDesignId"
    LEFT JOIN "LiftDesign" cl ON cl."calculationId" = c."id"
    LEFT JOIN LATERAL (SELECT "id" FROM "LiftDesign" WHERE "projectId" = p."id" ORDER BY "createdAt" DESC LIMIT 1) d ON true
    WHERE p."companyId" = ${companyId} AND p."archivedAt" IS NULL`;
  const linked = await prisma.project.findMany({
    where: { companyId, archivedAt: null, schede: { some: { deletedAt: null } } }, orderBy: { updatedAt: 'desc' }, take: MAX_LINKED,
    select: { id: true, kind: true, address: true, city: true, province: true, plantNumber: true },
  });
  const ids = linked.map((p) => p.id), byId = new Map(latest.map((r) => [r.id, r]));
  const [schede, calcs, lifts] = await Promise.all([
    prisma.scheda.findMany({ where: { companyId, deletedAt: null, projectId: { in: ids } }, orderBy: [{ data: 'desc' }, { createdAt: 'desc' }],
      select: { ...RILIEVO_SELECT, projectId: true } }),
    prisma.calculation.findMany({ where: { companyId, id: { in: linked.flatMap((p) => byId.get(p.id)?.calcId ?? []) } }, select: CALC_SELECT }),
    prisma.liftDesign.findMany({ where: { companyId, id: { in: linked.flatMap((p) => byId.get(p.id)?.liftId ?? []) } }, select: LIFT_SELECT }),
  ]);
  const surveys = new Map<string, RilievoDati[]>();
  for (const s of schede) if (s.projectId) surveys.set(s.projectId, [...(surveys.get(s.projectId) ?? []), rilievoDati(s)]);
  let conDifferenze = 0;
  for (const p of linked) {
    const row = byId.get(p.id), calc = calcs.find((c) => c.id === row?.calcId) ?? null, lift = lifts.find((d) => d.id === row?.liftId) ?? null;
    if (sintesi(righeDi(p, surveys.get(p.id) ?? [], calc, lift)).diff > 0) conDifferenze++;
  }
  let daAggiornare = 0, perSoftware = 0, perRilievo = 0;
  for (const r of latest) {
    if (!r.calcId || !r.calcAt || r.cEngine === null) continue;
    const old = outdated.calc({ engineVersion: r.cEngine, shaftDesign: r.cShaft === null ? null : { engineVersion: r.cShaft },
      liftDesign: r.cLift === null ? null : { engineVersion: r.cLift } });
    const why = calcoloDaAggiornare({ createdAt: r.calcAt, old }, surveys.get(r.id)?.[0] ?? null);
    if (!why) continue;
    daAggiornare++;
    if (why.old) perSoftware++;
    if (why.rilievo) perRilievo++;
  }
  return { conDifferenze, daAggiornare, perSoftware, perRilievo };
}
