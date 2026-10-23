import 'server-only';
// The identity of an issued set beyond its own row: the date of its first issue (R0 in the title block of a revision),
// read from the row of revision 0 of the same number.
import { prisma } from '@/lib/db';

/** The date of the first issue of the set's number; null when its row is gone (the row's own date is taken then). */
export async function firstIssuedAt(companyId: string, s: { year: number; seq: number; revision: number; createdAt: Date }): Promise<Date | null> {
  if (s.revision === 0) return s.createdAt;
  const first = await prisma.drawingSet.findFirst({ where: { companyId, year: s.year, seq: s.seq, revision: 0 }, select: { createdAt: true } });
  return first?.createdAt ?? null;
}
