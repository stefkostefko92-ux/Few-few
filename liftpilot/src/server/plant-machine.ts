import 'server-only';
// The catalogue's machine of an installation, as its next drawing set would carry it, and whether its data are those of
// a whole drawing (round 45: by record, not by the installation's former kind): the latest lift design when it has one
// (the machine its proposal took from a catalogue); else the latest «Calcolo argano» (the catalogue's machine its values
// are), whose Progetto draws the whole shaft or only surveys the machine room (intervento.ts disegnoDi); without one, a
// shaft design of the archive (a whole project before the one form) keeps the data whole. The form of the data of the
// installation checks the machine's name against it and shows the shaft's fields for a whole drawing.
import type { SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { liftRecord } from '@/lib/lift-record';
import { valueMarks } from '@/lib/lift/marks';
import { disegnoDi } from '@/lib/lift/intervento';
import { calcMachine } from '@/lib/order/machine';
import { STEP2, tipoDi } from './calcolo-base';
import { readCalc, storedCollaudo } from './records';

export interface PlantMachine {
  /** the data of a whole drawing: a lift design, or a «Calcolo argano» whose Progetto draws the shaft */
  whole: boolean;
  catalog: { brand: string; model: string } | null;
}

export async function projectCatalogMachine(user: SessionUser, projectId: string): Promise<PlantMachine> {
  const d = await prisma.liftDesign.findFirst({
    where: { projectId, companyId: user.companyId }, orderBy: { createdAt: 'desc' },
    select: { inputs: true, engineVersion: true, shaftDesign: { select: { sha256: true } }, calculation: { select: { sha256: true } } },
  });
  if (d) {
    const r = liftRecord(d, d.shaftDesign.sha256, d.calculation.sha256);
    const c = r ? valueMarks(r.inputs.auto, r.dv, r.dv.bottom, r.dv.collaudo).catalog : null;
    return { whole: true, catalog: c ? { brand: c.brand, model: c.model } : null };
  }
  const last = await prisma.calculation.findFirst({
    where: { projectId, companyId: user.companyId, ...STEP2 }, orderBy: { createdAt: 'desc' }, select: { inputs: true, sha256: true, collaudo: true, intervento: true },
  });
  const read = last ? readCalc(last) : null;
  if (!last || !read) return { whole: (await prisma.shaftDesign.count({ where: { projectId, companyId: user.companyId } })) > 0, catalog: null };
  const m = calcMachine(read.values);
  return { whole: disegnoDi(tipoDi(last), storedCollaudo(read.values, last.collaudo), read.values) === 'vano', catalog: m ? { brand: m.brand, model: m.model } : null };
}
