import 'server-only';
// The base of an RT after the owner's model (round 52): the installation's latest «Calcolo argano» (its step-2
// calculation) reproduced by the running engine, its results, its acceptance test, and the installation's registry,
// plant data and identity. No Progetto is needed: the model's pages read the calculation and ask the rest. Why an
// installation cannot have one now: no calculation, a «Trasformazione completa» or a test to UNI EN 81-20/50, a
// calculation the running engine no longer reproduces (its page offers «Aggiorna con il software attuale").
// Company-scoped like queries.ts.
import type { FormValues } from '@/calc/types';
import type { SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { TipoIntervento } from '@/lib/lift/intervento';
import { plantData } from '@/lib/plant';
import { anagraficaData } from '@/lib/rt/anagrafica';
import { idoneoRt } from '@/lib/rt/sezioni';
import type { BaseRt2 } from '@/lib/rt2/contesto';
import { risultatiDi } from '@/lib/rt2/risultati';
import { calcoloBase } from '../calcolo-base';

export type Rt2NonIdoneo = 'noCalc' | 'trasformazione' | 'en81' | 'engineChanged';


/** The identity of the installation as the RT prints it. */
export interface ProjectRt2 {
  name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  plantNumber: string | null;
  client: string | null;
}

export interface Rt2Base {
  base: BaseRt2;
  calc: { id: string; sha256: string; createdAt: Date; tipo: TipoIntervento };
}

export interface Rt2BaseState {
  calc: { id: string; createdAt: Date; tipo: TipoIntervento } | null;
  result: { ok: true; base: Rt2Base } | { ok: false; reason: Rt2NonIdoneo };
}

/** A base from a calculation's values, test and the installation's registry and plant data (stored JSON, read
 *  leniently). */
export function baseDi(values: FormValues, C: BaseRt2['C'], anagrafica: unknown, plant: unknown): BaseRt2 {
  const pl = plantData(plant);
  return { V: values, C, res: risultatiDi(values), anagrafica: anagraficaData(anagrafica), ...(pl.liftUse ? { liftUse: pl.liftUse } : {}) };
}

/** The base of an active installation of the company now. */
export async function rt2BaseOf(user: SessionUser, projectId: string): Promise<Rt2BaseState> {
  const c = await calcoloBase(user, projectId);
  if (!c) return { calc: null, result: { ok: false, reason: 'noCalc' } };
  const calc = { id: c.id, createdAt: c.createdAt, tipo: c.tipo };
  const not = idoneoRt(c.tipo, c.collaudo.norma);
  if (not) return { calc, result: { ok: false, reason: not } };
  if (!c.same) return { calc, result: { ok: false, reason: 'engineChanged' } };
  const [p, row] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId }, select: { anagrafica: true, plant: true } }),
    prisma.calculation.findUnique({ where: { id: c.id }, select: { sha256: true } }),
  ]);
  if (!p || !row) return { calc: null, result: { ok: false, reason: 'noCalc' } };
  return { calc, result: { ok: true, base: { base: baseDi(c.values, c.collaudo, p.anagrafica, p.plant), calc: { ...calc, sha256: row.sha256 } } } };
}
