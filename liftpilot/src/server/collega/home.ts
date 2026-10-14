import 'server-only';
// The Rilievi home's figures (round 44), from the company's records only, defined so that each says what it counts:
//   * «Rilievi senza impianto» — the surveys out of the trash not linked to any installation;
//   * «Impianti con differenze» — the active installations whose reference survey and records disagree on what exists on
//     site (the comparison's STATO DI FATTO rows marked as a probable error, src/lib/collega/confronto.ts);
//   * «Calcoli da aggiornare» — the active installations whose latest calculation the running engines no longer reproduce,
//     or which is older than the last change of the reference survey (src/lib/collega/passi.ts) — each installation once.
// Each figure comes with its installations (the tiles open /app/impianti?stato=differenze|aggiornare, those only). The
// recent surveys come with their link. What a role may not see is not read (the page passes its rights).
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { sintesi } from '@/lib/collega/confronto';
import { calcoloDaAggiornare } from '@/lib/collega/passi';
import { RILIEVO_SELECT, rilievoDati, type RilievoDati } from '@/lib/collega/rilievo';
import { outdated } from '../records';
import { CALC_SELECT, LIFT_SELECT, righeDi } from './impianto';

/** The active installations with surveys are compared for the differences in batches of this many (the memory one
 *  batch's records take), all of them up to MAX_LINKED (the latest changed first): past it the figure says «at least»
 *  (`capped`) — a bound on the page's time, not a size a company of installers reaches. */
const BATCH = 250;
export const MAX_LINKED = 5000;

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
  /** the differences were looked for among the MAX_LINKED latest changed only: there may be more */
  capped: boolean;
  /** active installations whose latest calculation is «da aggiornare», and why (one may have both reasons) */
  daAggiornare: number;
  perSoftware: number;
  perRilievo: number;
  /** the installations of each figure (the filtered list) */
  ids: { differenze: string[]; aggiornare: string[] };
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
  const byId = new Map(latest.map((r) => [r.id, r]));
  const differenze: string[] = [], ref = new Map<string, RilievoDati>();
  // the order is read once (ids only), the records batch by batch: one changed meanwhile is neither skipped nor counted twice
  const where = { companyId, archivedAt: null, schede: { some: { deletedAt: null } } };
  const order = await prisma.project.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: MAX_LINKED + 1, select: { id: true } });
  const capped = order.length > MAX_LINKED, all = order.slice(0, MAX_LINKED).map((p) => p.id);
  for (let i = 0; i < all.length; i += BATCH) {
    const ids = all.slice(i, i + BATCH);
    const [linked, schede, calcs, lifts] = await Promise.all([
      prisma.project.findMany({ where: { companyId, archivedAt: null, id: { in: ids } }, select: { id: true, kind: true, address: true, city: true, province: true, plantNumber: true } }),
      prisma.scheda.findMany({ where: { companyId, deletedAt: null, projectId: { in: ids } }, orderBy: [{ data: 'desc' }, { createdAt: 'desc' }],
        select: { ...RILIEVO_SELECT, projectId: true } }),
      prisma.calculation.findMany({ where: { companyId, id: { in: ids.flatMap((id) => byId.get(id)?.calcId ?? []) } }, select: CALC_SELECT }),
      prisma.liftDesign.findMany({ where: { companyId, id: { in: ids.flatMap((id) => byId.get(id)?.liftId ?? []) } }, select: LIFT_SELECT }),
    ]);
    const surveys = new Map<string, RilievoDati[]>();
    for (const s of schede) if (s.projectId) surveys.set(s.projectId, [...(surveys.get(s.projectId) ?? []), rilievoDati(s)]);
    for (const p of linked) {
      const row = byId.get(p.id), calc = calcs.find((c) => c.id === row?.calcId) ?? null, lift = lifts.find((d) => d.id === row?.liftId) ?? null;
      const mine = surveys.get(p.id) ?? [];
      if (mine[0]) ref.set(p.id, mine[0]);
      if (sintesi(righeDi(p, mine, calc, lift)).diff > 0) differenze.push(p.id);
    }
  }
  const aggiornare: string[] = [];
  let perSoftware = 0, perRilievo = 0;
  for (const r of latest) {
    if (!r.calcId || !r.calcAt || r.cEngine === null) continue;
    const old = outdated.calc({ engineVersion: r.cEngine, shaftDesign: r.cShaft === null ? null : { engineVersion: r.cShaft },
      liftDesign: r.cLift === null ? null : { engineVersion: r.cLift } });
    const why = calcoloDaAggiornare({ createdAt: r.calcAt, old }, ref.get(r.id) ?? null);
    if (!why) continue;
    aggiornare.push(r.id);
    if (why.old) perSoftware++;
    if (why.rilievo) perRilievo++;
  }
  return { conDifferenze: differenze.length, capped, daAggiornare: aggiornare.length, perSoftware, perRilievo,
    ids: { differenze, aggiornare } };
}
