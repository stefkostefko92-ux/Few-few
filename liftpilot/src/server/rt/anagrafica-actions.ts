'use server';

// The installation's registry for the relazione tecnica di modifica (owner's decision 8; Project.anagrafica): the owner,
// the maintenance company, the construction number, the year, the approval regime and its confirmation, the documented
// «before» data with their source — saved by whoever edits the installation's data (projects:edit), never on an archived
// installation; validated with zod (src/lib/rt/anagrafica.ts), an empty registry stored as SQL NULL (the column's CHECK).
// Each issued RT keeps its own copy: a change here moves no issued RT.
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { idSchema } from '@/lib/schemas';
import { anagraficaSchema, type Anagrafica } from '@/lib/rt/anagrafica';

export type AnagraficaResult = { ok: true } | { ok: false; error: 'forbidden' | 'rateLimited' | 'invalidFields' | 'notFound'; campi?: string[] };

/** The registry without the groups left empty. */
function compatta(a: Anagrafica): Anagrafica {
  const out: Anagrafica = { ...a };
  if (out.proprietario && !Object.keys(out.proprietario).length) delete out.proprietario;
  if (out.prima && !Object.keys(out.prima).length) delete out.prima;
  return out;
}

export async function saveAnagraficaAction(input: { projectId: unknown; anagrafica: unknown }): Promise<AnagraficaResult> {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword || !can(user, 'projects:edit')) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`anagrafica:${user.id}`, 120, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  const id = idSchema.safeParse(input.projectId), a = anagraficaSchema.safeParse(input.anagrafica ?? {});
  if (!id.success) return { ok: false, error: 'notFound' };
  if (!a.success) return { ok: false, error: 'invalidFields', campi: [...new Set(a.error.issues.map((i) => i.path.join('.')))] };
  const data = compatta(a.data), empty = Object.keys(data).length === 0;
  const res = await prisma.project.updateMany({
    where: { id: id.data, companyId: user.companyId, archivedAt: null },
    data: { anagrafica: empty ? Prisma.DbNull : (data as Prisma.InputJsonValue) },
  });
  if (res.count !== 1) return { ok: false, error: 'notFound' };
  await audit({ companyId: user.companyId, userId: user.id, action: 'ANAGRAFICA_UPDATED', entity: 'Project', entityId: id.data });
  return { ok: true };
}
