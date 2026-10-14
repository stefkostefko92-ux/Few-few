import 'server-only';
// An installation with its surveys (round 44): the surveys newest first, the comparison of the reference survey with the
// latest calculation and the latest design, and the four steps from the survey to the documents — all from the records
// of the company of the signed-in user (an installation of another company never reaches here: its page is 404 first).
import { z } from 'zod';
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { confronto, erroriDi, type Riga } from '@/lib/collega/confronto';
import { latoCalcolo, latoProgetto } from '@/lib/collega/lati';
import { passi, type Passi } from '@/lib/collega/passi';
import type { RilievoDati } from '@/lib/collega/rilievo';
import { indirizzoImpianto } from '@/lib/collega/testo';
import { outdated } from '../records';
import { rilieviImpianto, type RilievoElencato } from './queries';

/** A saved calculation as the comparison and the steps read it. */
export const CALC_SELECT = {
  id: true, createdAt: true, inputs: true, engineVersion: true,
  shaftDesign: { select: { engineVersion: true } }, liftDesign: { select: { engineVersion: true, inputs: true } },
} as const;
/** A saved lift design as the comparison and the steps read it. */
export const LIFT_SELECT = {
  id: true, createdAt: true, inputs: true, engineVersion: true,
  calculation: { select: { engineVersion: true } }, shaftDesign: { select: { engineVersion: true, results: true } },
} as const;

type CalcRow = { id: string; createdAt: Date; inputs: unknown; engineVersion: string; shaftDesign: { engineVersion: string } | null;
  liftDesign: { engineVersion: string; inputs: unknown } | null };
type LiftRow = { id: string; createdAt: Date; inputs: unknown; engineVersion: string; calculation: { engineVersion: string };
  shaftDesign: { engineVersion: string; results: unknown } };

/** The car mass of a whole project's design is the software's estimate while its switch is on (not a measure). */
const autoP = z.object({ auto: z.object({ P: z.boolean() }).passthrough() }).passthrough();
const pStimato = (c: CalcRow): boolean => { const a = c.liftDesign ? autoP.safeParse(c.liftDesign.inputs) : null; return !!a?.success && a.data.auto.P; };

export interface ImpiantoInfo {
  id: string;
  kind: 'REPLACEMENT' | 'FULL';
  address: string | null;
  city: string | null;
  province: string | null;
  plantNumber: string | null;
}

/** The comparison's rows of an installation from its records (none without a reference survey). */
export function righeDi(p: ImpiantoInfo, rilievi: readonly RilievoDati[], calc: CalcRow | null, lift: LiftRow | null): Riga[] {
  const ref = rilievi[0];
  if (!ref) return [];
  return confronto({
    rilievo: ref, storico: rilievi.slice(1), impianto: { kind: p.kind, indirizzo: indirizzoImpianto(p), plantNumber: p.plantNumber },
    calcolo: calc ? latoCalcolo(calc, pStimato(calc)) : null,
    progetto: lift ? latoProgetto({ id: lift.id, createdAt: lift.createdAt, inputs: lift.inputs, shaftResults: lift.shaftDesign.results }) : null,
  });
}

export interface Collegamento {
  rilievi: RilievoElencato[];
  righe: Riga[];
  passi: Passi;
  /** the records the steps and the comparison read (their pages) */
  calcolo: { id: string; createdAt: Date } | null;
  progetto: { id: string; createdAt: Date; kind: 'lift' | 'room' } | null;
  tavole: { id: string; createdAt: Date } | null;
}

export async function collegamentoImpianto(user: SessionUser, p: ImpiantoInfo): Promise<Collegamento> {
  const mine = { projectId: p.id, companyId: user.companyId }, latest = { orderBy: { createdAt: 'desc' as const } };
  const [rilievi, calc, lift, room, set] = await Promise.all([
    rilieviImpianto(user, p.id),
    prisma.calculation.findFirst({ where: mine, ...latest, select: CALC_SELECT }),
    p.kind === 'FULL' ? prisma.liftDesign.findFirst({ where: mine, ...latest, select: LIFT_SELECT }) : Promise.resolve(null),
    p.kind === 'REPLACEMENT'
      ? prisma.roomDesign.findFirst({ where: mine, ...latest, select: { id: true, createdAt: true, engineVersion: true, calculation: { select: { engineVersion: true } } } })
      : Promise.resolve(null),
    prisma.drawingSet.findFirst({ where: mine, ...latest, select: { id: true, createdAt: true } }),
  ]);
  const righe = righeDi(p, rilievi.map((r) => r.dati), calc, lift);
  const design = lift ? { id: lift.id, createdAt: lift.createdAt, kind: 'lift' as const, old: outdated.lift(lift) }
    : room ? { id: room.id, createdAt: room.createdAt, kind: 'room' as const, old: outdated.room(room) } : null;
  return {
    rilievi, righe,
    passi: passi({
      rilievo: rilievi[0]?.dati ?? null, calcolo: calc ? { createdAt: calc.createdAt, old: outdated.calc(calc) } : null, progetto: design, tavole: set,
      // a replacement's machine room keeps no data of the comparison: its own differences are none
      erroriCalcolo: erroriDi(righe, 'calcolo').length, erroriProgetto: lift ? erroriDi(righe, 'progetto').length : 0,
    }),
    calcolo: calc ? { id: calc.id, createdAt: calc.createdAt } : null,
    progetto: design ? { id: design.id, createdAt: design.createdAt, kind: design.kind } : null,
    tavole: set,
  };
}
