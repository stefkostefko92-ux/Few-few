import 'server-only';
// Where the one form of an installation starts: a saved lift design of the same installation (?from=, else the
// latest); an installation without one carries over its latest shaft design and calculation, entered as they were —
// a replacement become a whole project also the standards chosen for its test and the shaft and the machine room of
// its latest survey; else the example to start from, as a new lift (a whole project). Always the user's company.
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { formValuesSchema } from '@/lib/calc-input';
import { liftInputsReadSchema } from '@/lib/lift-input';
import { surveySchema } from '@/lib/room/survey';
import { shaftInputsReadSchema } from '@/lib/shaft-input';
import { AUTO_ALL, newLift, type LiftInputs } from '@/lib/lift';
import { storedCollaudo } from './records';

export async function liftStart(user: SessionUser, projectId: string, fromId: string | null): Promise<LiftInputs> {
  const find = (id: string | null) => prisma.liftDesign.findFirst({
    where: { projectId, companyId: user.companyId, ...(id ? { id } : {}) },
    orderBy: { createdAt: 'desc' },
    select: { inputs: true },
  });
  // an id not of this installation (or not the company's) counts as none: the latest is taken
  const lift = (fromId ? await find(fromId) : null) ?? await find(null);
  const parsed = lift ? liftInputsReadSchema.safeParse(lift.inputs) : null;
  if (parsed?.success) return parsed.data;
  const base = newLift();
  const mine = { projectId, companyId: user.companyId }, latest = { orderBy: { createdAt: 'desc' as const } };
  const [shaft, calc, room] = await Promise.all([
    prisma.shaftDesign.findFirst({ where: mine, ...latest, select: { inputs: true } }),
    prisma.calculation.findFirst({ where: mine, ...latest, select: { inputs: true, collaudo: true } }),
    prisma.roomDesign.findFirst({ where: mine, ...latest, select: { inputs: true } }),
  ]);
  const S = shaft ? shaftInputsReadSchema.safeParse(shaft.inputs) : null, C = calc ? formValuesSchema.safeParse(calc.inputs) : null;
  if (!S?.success && !C?.success) return base;
  const calcValues = C?.success ? C.data : base.calc;
  const q = Number(calcValues.Q), v = Number(calcValues.v), H = Number(calcValues.H);
  let shaftInputs = S?.success ? S.data : base.shaft;
  // a replacement's survey: the shaft under the machine room (inner size, walls) and the room as measured
  const R = !S?.success && room ? surveySchema.safeParse(room.inputs) : null;
  if (R?.success) shaftInputs = { ...shaftInputs, W: R.data.shaft.W, D: R.data.shaft.D, wall: R.data.shaft.wall, room: R.data.room };
  if (C?.success && Number.isFinite(v) && v > 0) shaftInputs = { ...shaftInputs, vertical: { ...shaftInputs.vertical, v } };
  // a calculation without a shaft design: floors of equal height giving its travel
  if (C?.success && !S?.success && Number.isFinite(H) && H > 0) {
    const n = Math.max(2, Math.round(H / 3) + 1), rise = Math.round((H * 1000) / (n - 1));
    shaftInputs = { ...shaftInputs, vertical: { ...shaftInputs.vertical, main: 0, floors: Array.from({ length: n }, (_, i) => ({ label: String(i), rise: i < n - 1 ? rise : 0, door: 'A' as const })) } };
  }
  return {
    // the rated load of the calculation is the one the installation has: the shaft takes it as given
    shaft: C?.success && Number.isFinite(q) && q > 0 ? { ...shaftInputs, Q: Math.round(q) } : shaftInputs,
    calc: calcValues,
    // what was entered stays entered
    auto: C?.success ? { P: false, machine: false, L0: false, dx: false, Hv: false } : AUTO_ALL,
    // the standards chosen for the replacement's test (normalised as its documents read them)
    ...(C?.success && calc?.collaudo ? { collaudo: storedCollaudo(C.data, calc.collaudo) } : {}),
  };
}
