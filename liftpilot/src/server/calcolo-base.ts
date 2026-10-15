import 'server-only';
// The «Calcolo argano» of an installation (round 45): its step-2 calculations — those the calculator saves, neither a
// lift design's calculation nor one made from a shaft design (the archive before the one form). The base a Progetto is
// drawn on is one of them; the installation's type is read from them, never stored on the project. Company-scoped as
// queries.ts: a foreign or archived project, or an id that is not a step-2 calculation of it, gives nothing.
import type { Prisma } from '@prisma/client';
import type { FormValues } from '@/calc/types';
import type { SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { collaudoReadSchema } from '@/lib/lift-input';
import { interventoDi, type TipoIntervento } from '@/lib/lift/intervento';
import type { Collaudo } from '@/lib/lift/collaudo';
import { readCalc, storedCollaudo } from './records';

/** A step-2 calculation: no lift design made it, no shaft design started it. */
export const STEP2 = { liftDesign: { is: null }, shaftDesignId: null } satisfies Prisma.CalculationWhereInput;

const ROW = { id: true, createdAt: true, inputs: true, sha256: true, collaudo: true, intervento: true } as const;

/** The type of a saved calculation: the one declared with it, else read by its shape (its context and its test as
 *  stored; nothing stored — the replacement's default). */
export function tipoDi(c: { inputs: unknown; collaudo: unknown; intervento: TipoIntervento | null }): TipoIntervento {
  if (c.intervento) return c.intervento;
  const values = c.inputs && typeof c.inputs === 'object' ? (c.inputs as FormValues) : {};
  const raw = c.collaudo ? collaudoReadSchema.safeParse(c.collaudo) : null;
  return interventoDi(values.context, raw?.success ? raw.data : null);
}

export interface CalcoloBase {
  id: string;
  createdAt: Date;
  values: FormValues;
  /** the test as the documents read it */
  collaudo: Collaudo;
  tipo: TipoIntervento;
  /** the type was declared with the calculation (round 45), not read by its shape */
  dichiarato: boolean;
  /** the running engine reproduces it */
  same: boolean;
}

/** The step-2 calculation `id` of an active project of the company, else (no id) its latest one; null when there is
 *  none, the project is not the company's or is archived, or `id` is not a step-2 calculation of it. */
export async function calcoloBase(user: SessionUser, projectId: string, id?: string): Promise<CalcoloBase | null> {
  const c = await prisma.calculation.findFirst({
    where: { projectId, companyId: user.companyId, project: { archivedAt: null }, ...STEP2, ...(id ? { id } : {}) },
    orderBy: { createdAt: 'desc' },
    select: ROW,
  });
  const read = c ? readCalc(c) : null;
  if (!c || !read) return null;
  return { id: c.id, createdAt: c.createdAt, values: read.values, collaudo: storedCollaudo(read.values, c.collaudo), tipo: tipoDi(c), dichiarato: c.intervento !== null,
    same: read.same };
}

/** A calculation as the lists read its type (a raw query's columns): the type declared, its context, its test. */
export interface TipoRiga {
  intervento: TipoIntervento | null;
  context: string | null;
  collaudo: unknown;
}

/** The type of an installation from its latest step-2 calculation, else its latest calculation of any provenance (a
 *  whole project before round 45); null — none: «Intervento da definire». Mapped here, never stored. */
export const tipoDaUltimi = (step2: TipoRiga | null, any: TipoRiga | null): TipoIntervento | null => {
  const c = step2 ?? any;
  return c ? tipoDi({ inputs: { context: c.context ?? undefined }, collaudo: c.collaudo, intervento: c.intervento }) : null;
};

/** The type of an installation: its latest step-2 calculation's; else that of its latest calculation of any provenance
 *  (a whole project before round 45, read by its shape); null — «Intervento da definire». */
export async function tipoImpianto(user: SessionUser, projectId: string): Promise<TipoIntervento | null> {
  const where = { projectId, companyId: user.companyId };
  const c = await prisma.calculation.findFirst({ where: { ...where, ...STEP2 }, orderBy: { createdAt: 'desc' }, select: ROW })
    ?? await prisma.calculation.findFirst({ where, orderBy: { createdAt: 'desc' }, select: ROW });
  return c ? tipoDi(c) : null;
}

/** A calculation the machine room is surveyed on: a step-2 calculation of an existing lift (context 'repl', «Solo
 *  argano» or «Ammodernamento»), whatever the installation was called before round 45. */
export function rilevaLocale(c: { liftDesign: unknown; shaftDesignId: string | null; inputs: unknown }): boolean {
  const V = c.inputs && typeof c.inputs === 'object' ? (c.inputs as FormValues) : {};
  return !c.liftDesign && !c.shaftDesignId && V.context === 'repl';
}

/** The lift designs drawn on a «Calcolo argano» of the company, newest first. */
export function progettiSu(user: SessionUser, calculationId: string) {
  return prisma.liftDesign.findMany({
    where: { baseCalculationId: calculationId, companyId: user.companyId }, orderBy: { createdAt: 'desc' }, take: 50,
    select: { id: true, label: true, createdAt: true, verdict: true, failCount: true, warnCount: true, summary: true },
  });
}
