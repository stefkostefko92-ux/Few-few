import 'server-only';
// An installation with its surveys (round 44): the surveys newest first, the comparison of the reference survey with the
// installation's «Calcolo argano» and its latest lift design, and the four steps from the survey to the documents — all
// from the records of the company of the signed-in user (an installation of another company never reaches here: its
// page is 404 first). Round 45, by record, never by a kind of installation: the calculation is the latest step-2
// calculation (else, before round 45, the latest of any provenance); the Progetto the newest lift design, or — when the
// intervention's Progetto is the machine room (disegnoDi 'locale') — the newest of it and the machine rooms; it is
// aligned when drawn on that latest calculation (a design of the one form: when no calculation is newer than it), else
// «da aggiornare (calcolo più recente)». A role without 'rilievi:view' reads nothing of the surveys: no list, no
// comparison, steps not judged against the survey — only whether one is linked.
import { z } from 'zod';
import type { FormValues } from '@/calc/types';
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { confronto, erroriDi, type Riga } from '@/lib/collega/confronto';
import { latoCalcolo, latoProgetto } from '@/lib/collega/lati';
import { passi, type Passi } from '@/lib/collega/passi';
import type { RilievoDati } from '@/lib/collega/rilievo';
import { indirizzoImpianto } from '@/lib/collega/testo';
import { disegnoDi, type TipoIntervento } from '@/lib/lift/intervento';
import { STEP2, tipoDi } from '../calcolo-base';
import { outdated, storedCollaudo } from '../records';
import { rilieviImpianto, type RilievoElencato } from './queries';

/** A saved calculation as the comparison and the steps read it (its type and test: the installation's Progetto). */
export const CALC_SELECT = {
  id: true, createdAt: true, inputs: true, engineVersion: true, collaudo: true, intervento: true,
  shaftDesign: { select: { engineVersion: true } }, liftDesign: { select: { engineVersion: true, inputs: true } },
} as const;
/** A saved lift design as the comparison and the steps read it (its base: what it was drawn on). */
export const LIFT_SELECT = {
  id: true, createdAt: true, inputs: true, engineVersion: true, baseCalculationId: true,
  calculation: { select: { engineVersion: true } }, shaftDesign: { select: { engineVersion: true, results: true } },
} as const;

type CalcRow = { id: string; createdAt: Date; inputs: unknown; engineVersion: string; collaudo: unknown; intervento: TipoIntervento | null;
  shaftDesign: { engineVersion: string } | null; liftDesign: { engineVersion: string; inputs: unknown } | null };
type LiftRow = { id: string; createdAt: Date; inputs: unknown; engineVersion: string; baseCalculationId: string | null; calculation: { engineVersion: string };
  shaftDesign: { engineVersion: string; results: unknown } };

/** The car mass of a whole project's design is the software's estimate while its switch is on (not a measure). */
const autoP = z.object({ auto: z.object({ P: z.boolean() }).passthrough() }).passthrough();
const pStimato = (c: CalcRow): boolean => { const a = c.liftDesign ? autoP.safeParse(c.liftDesign.inputs) : null; return !!a?.success && a.data.auto.P; };

export interface ImpiantoInfo {
  id: string;
  address: string | null;
  city: string | null;
  province: string | null;
  plantNumber: string | null;
}

/** The comparison's rows of an installation from its records (none without a reference survey): a lift design drawn
 *  on a «Calcolo argano» gives the drawing's side only (lati.ts). */
export function righeDi(p: ImpiantoInfo, rilievi: readonly RilievoDati[], calc: CalcRow | null, lift: LiftRow | null): Riga[] {
  const ref = rilievi[0];
  if (!ref) return [];
  return confronto({
    rilievo: ref, storico: rilievi.slice(1), impianto: { indirizzo: indirizzoImpianto(p), plantNumber: p.plantNumber },
    calcolo: calc ? latoCalcolo(calc, pStimato(calc)) : null,
    progetto: lift ? latoProgetto({ id: lift.id, createdAt: lift.createdAt, inputs: lift.inputs, shaftResults: lift.shaftDesign.results, based: lift.baseCalculationId !== null }) : null,
  });
}

/** The Progetto of an installation as its intervention has it: the machine room surveyed, or the shaft drawn. */
export type Disegno = 'locale' | 'vano';

export interface Collegamento {
  /** the installation's surveys newest first (none read for a role that does not see them) */
  rilievi: RilievoElencato[];
  righe: Riga[];
  passi: Passi;
  /** the records the steps and the comparison read (their pages): the calculation — the latest step-2 one, else (before
   *  round 45) the latest of any provenance —, the latest step-2 calculation alone (`base`: what a Progetto is drawn
   *  on), the Progetto's record (aligned: on that calculation) and the latest set */
  calcolo: { id: string; createdAt: Date } | null;
  base: { id: string; createdAt: Date } | null;
  progetto: { id: string; createdAt: Date; kind: 'lift' | 'room'; allineato: boolean } | null;
  tavole: { id: string; createdAt: Date } | null;
  /** the installation's type of intervention and what its Progetto is (null: no calculation yet) */
  tipo: TipoIntervento | null;
  disegno: Disegno | null;
}

/** The type and the Progetto of an installation from its calculation (its context, test and type as saved). */
function interventoDi(c: CalcRow | null): { tipo: TipoIntervento | null; disegno: Disegno | null } {
  if (!c) return { tipo: null, disegno: null };
  const V = c.inputs && typeof c.inputs === 'object' ? (c.inputs as FormValues) : {}, tipo = tipoDi(c);
  return { tipo, disegno: disegnoDi(tipo, storedCollaudo(V, c.collaudo), V) };
}

export async function collegamentoImpianto(user: SessionUser, p: ImpiantoInfo): Promise<Collegamento> {
  const mine = { projectId: p.id, companyId: user.companyId }, latest = { orderBy: { createdAt: 'desc' as const } };
  const sees = can(user, 'rilievi:view');
  const [rilievi, linked, step2, any, lift, set] = await Promise.all([
    sees ? rilieviImpianto(user, p.id) : Promise.resolve([]),
    sees ? Promise.resolve(0) : prisma.scheda.count({ where: { ...mine, deletedAt: null } }),
    prisma.calculation.findFirst({ where: { ...mine, ...STEP2 }, ...latest, select: CALC_SELECT }),
    prisma.calculation.findFirst({ where: mine, ...latest, select: CALC_SELECT }),
    prisma.liftDesign.findFirst({ where: mine, ...latest, select: LIFT_SELECT }),
    prisma.drawingSet.findFirst({ where: mine, ...latest, select: { id: true, createdAt: true } }),
  ]);
  const calc = step2 ?? any, { tipo, disegno } = interventoDi(calc);
  // the machine room is the Progetto of an intervention that only touches the machine room's parts
  const room = disegno === 'locale' ? await prisma.roomDesign.findFirst({
    where: mine, ...latest, select: { id: true, createdAt: true, engineVersion: true, calculationId: true, calculation: { select: { engineVersion: true } } },
  }) : null;
  const righe = righeDi(p, rilievi.map((r) => r.dati), calc, lift);
  const useRoom = room && (!lift || room.createdAt > lift.createdAt);
  const allineato = !step2 ? true : useRoom ? room.calculationId === step2.id
    : lift ? (lift.baseCalculationId !== null ? lift.baseCalculationId === step2.id : step2.createdAt <= lift.createdAt) : true;
  const design = useRoom ? { id: room.id, createdAt: room.createdAt, kind: 'room' as const, old: outdated.room(room), allineato }
    : lift ? { id: lift.id, createdAt: lift.createdAt, kind: 'lift' as const, old: outdated.lift(lift), allineato } : null;
  return {
    rilievi, righe,
    passi: passi({
      rilievo: rilievi[0]?.dati ?? null, ...(sees ? {} : { collegato: linked > 0 }),
      calcolo: calc ? { createdAt: calc.createdAt, old: outdated.calc(calc) } : null,
      progetto: design ? { createdAt: design.createdAt, old: design.old, superato: !design.allineato } : null, tavole: set,
      // a machine room keeps no data of the comparison: its own differences are none
      erroriCalcolo: erroriDi(righe, 'calcolo').length, erroriProgetto: design?.kind === 'lift' ? erroriDi(righe, 'progetto').length : 0,
    }),
    calcolo: calc ? { id: calc.id, createdAt: calc.createdAt } : null,
    base: step2 ? { id: step2.id, createdAt: step2.createdAt } : null,
    progetto: design ? { id: design.id, createdAt: design.createdAt, kind: design.kind, allineato: design.allineato } : null,
    tavole: set, tipo, disegno,
  };
}
