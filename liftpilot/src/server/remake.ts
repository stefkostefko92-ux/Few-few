import 'server-only';
// What «Aggiorna con il software attuale» and «Aggiorna il progetto con l'ultimo calcolo» share: the record a saved one
// was already made again into (the audit of the save keeps `updates`: a second tab or the back button finds it), and
// one making of a record at a time in the process (a second one at the same moment gets 'busy').
import type { SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

/** The record a saved one was already made again into (the audit of the save keeps `updates`), if any. */
export async function madeFrom(user: SessionUser, action: 'LIFT_DESIGN_SAVED' | 'CALCULATION_SAVED' | 'ROOM_DESIGN_SAVED', id: string): Promise<string | null> {
  const a = await prisma.auditLog.findFirst({
    where: { companyId: user.companyId, action, meta: { path: ['updates'], equals: id } }, orderBy: { createdAt: 'desc' }, select: { entityId: true },
  });
  return a?.entityId ?? null;
}

const making = new Set<string>();

/** One update of a record at a time in the process: a second one at the same moment gets 'busy'. */
export async function once<T>(id: string, make: () => Promise<T>): Promise<T | 'busy'> {
  if (making.has(id)) return 'busy';
  making.add(id);
  try {
    return await make();
  } finally {
    making.delete(id);
  }
}
