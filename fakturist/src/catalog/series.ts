import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { overlaps } from '../documents/numbering.js';
import { lockOrganization } from '../accounts/transfer-core.js';
import type { SeriesInput } from './schemas.js';

/**
 * Сериите на фирмата (SPEC 44). Всяка промяна е под заключването на фирмата — същото, което взема
 * издаването, затова номер не може да се издаде в диапазон, който в същия миг се мести. Две серии не се
 * застъпват; издадената част на серия (до `nextNumber − 1`) не се изрязва и началото ѝ не се мести.
 */
export class SeriesError extends Error {
  constructor(
    readonly code:
      'notFound' | 'nameTaken' | 'overlap' | 'startLocked' | 'issuedBelow' | 'inUse' | 'isDefault',
  ) {
    super(code);
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function assertFree(
  tx: Tx,
  organizationId: string,
  input: SeriesInput,
  exceptId: string | null,
): Promise<void> {
  const others = await tx.documentSeries.findMany({
    where: { organizationId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true, rangeStart: true, rangeEnd: true },
  });
  if (others.some((other) => other.name === input.name)) throw new SeriesError('nameTaken');
  if (others.some((other) => overlaps(other, input))) throw new SeriesError('overlap');
}

export async function createSeries(input: {
  organizationId: string;
  actorId: string;
  data: SeriesInput;
}): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    await lockOrganization(tx, input.organizationId);
    await assertFree(tx, input.organizationId, input.data, null);
    const hasDefault =
      (await tx.documentSeries.count({
        where: { organizationId: input.organizationId, isDefault: true },
      })) > 0;
    const series = await tx.documentSeries.create({
      data: {
        organizationId: input.organizationId,
        name: input.data.name,
        rangeStart: input.data.rangeStart,
        rangeEnd: input.data.rangeEnd,
        nextNumber: input.data.rangeStart,
        isDefault: !hasDefault,
      },
    });
    await audit(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      action: 'series.created',
      targetType: 'DocumentSeries',
      targetId: series.id,
      details: {
        rangeStart: input.data.rangeStart.toString(),
        rangeEnd: input.data.rangeEnd.toString(),
      },
    });
    return { id: series.id };
  });
}

/** Име и диапазон. С издадени документи началото е заключено, а краят не пада под издадения номер. */
export async function updateSeries(input: {
  organizationId: string;
  seriesId: string;
  actorId: string;
  data: SeriesInput;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockOrganization(tx, input.organizationId);
    const series = await tx.documentSeries.findFirst({
      where: { id: input.seriesId, organizationId: input.organizationId },
    });
    if (!series) throw new SeriesError('notFound');
    const issued = series.nextNumber > series.rangeStart;
    if (issued && input.data.rangeStart !== series.rangeStart) {
      throw new SeriesError('startLocked');
    }
    if (input.data.rangeEnd < series.nextNumber - 1n) throw new SeriesError('issuedBelow');
    await assertFree(tx, input.organizationId, input.data, series.id);
    await tx.documentSeries.update({
      where: { id: series.id },
      data: {
        name: input.data.name,
        rangeStart: input.data.rangeStart,
        rangeEnd: input.data.rangeEnd,
        // Неизползвана серия започва от новото си начало.
        ...(issued ? {} : { nextNumber: input.data.rangeStart }),
      },
    });
    await audit(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      action: 'series.updated',
      targetType: 'DocumentSeries',
      targetId: series.id,
      details: {
        rangeStart: input.data.rangeStart.toString(),
        rangeEnd: input.data.rangeEnd.toString(),
      },
    });
  });
}

export async function setDefaultSeries(input: {
  organizationId: string;
  seriesId: string;
  actorId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockOrganization(tx, input.organizationId);
    const series = await tx.documentSeries.findFirst({
      where: { id: input.seriesId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!series) throw new SeriesError('notFound');
    await tx.documentSeries.updateMany({
      where: { organizationId: input.organizationId, isDefault: true },
      data: { isDefault: false },
    });
    await tx.documentSeries.update({ where: { id: series.id }, data: { isDefault: true } });
    await audit(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      action: 'series.default',
      targetType: 'DocumentSeries',
      targetId: series.id,
    });
  });
}

/** Само неизползвана серия, която не е по подразбиране (издадена серия остава завинаги — веригата). */
export async function deleteSeries(input: {
  organizationId: string;
  seriesId: string;
  actorId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockOrganization(tx, input.organizationId);
    const series = await tx.documentSeries.findFirst({
      where: { id: input.seriesId, organizationId: input.organizationId },
      include: { _count: { select: { documents: true } } },
    });
    if (!series) throw new SeriesError('notFound');
    if (series.isDefault) throw new SeriesError('isDefault');
    if (series._count.documents > 0 || series.nextNumber > series.rangeStart) {
      throw new SeriesError('inUse');
    }
    await tx.documentSeries.delete({ where: { id: series.id } });
    await audit(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      action: 'series.deleted',
      targetType: 'DocumentSeries',
      targetId: series.id,
    });
  });
}
