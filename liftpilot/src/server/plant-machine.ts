import 'server-only';
// The catalogue's machine of an installation, as its next drawing set would carry it: a whole project's latest lift
// design (the machine its proposal took from a catalogue), a replacement's latest calculation (the catalogue's machine
// its values are). The form of the data of the installation checks the machine's name against it.
import type { SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { liftRecord } from '@/lib/lift-record';
import { valueMarks } from '@/lib/lift/marks';
import { calcMachine } from '@/lib/order/machine';
import { calcRecord } from './records';
import { getCalculation } from './queries';

export async function projectCatalogMachine(user: SessionUser, projectId: string, whole: boolean): Promise<{ brand: string; model: string } | null> {
  if (whole) {
    const d = await prisma.liftDesign.findFirst({
      where: { projectId, companyId: user.companyId }, orderBy: { createdAt: 'desc' },
      select: { inputs: true, engineVersion: true, shaftDesign: { select: { sha256: true } }, calculation: { select: { sha256: true } } },
    });
    const r = d ? liftRecord(d, d.shaftDesign.sha256, d.calculation.sha256) : null;
    const c = r ? valueMarks(r.inputs.auto, r.dv, r.dv.bottom, r.dv.collaudo).catalog : null;
    return c ? { brand: c.brand, model: c.model } : null;
  }
  const last = await prisma.calculation.findFirst({ where: { projectId, companyId: user.companyId }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  const c = last ? await getCalculation(user, last.id) : null, rec = c ? calcRecord(c) : null, m = rec ? calcMachine(rec.values) : null;
  return m ? { brand: m.brand, model: m.model } : null;
}
