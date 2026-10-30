'use server';
// The interface's mode of the signed-in user (round 52): «Semplice» or «Esperto», chosen in the top bar and kept with
// the user (never in the browser). Only the user's own preference: allowed in read-only mode too, never audited.
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';

const modalitaSchema = z.enum(['semplice', 'esperto']);
const MINUTE = 60_000;

export async function setModalitaAction(value: unknown): Promise<{ ok: boolean }> {
  const me = await getSessionUser();
  const m = modalitaSchema.safeParse(value);
  if (!me || !m.success) return { ok: false };
  if (!rateLimit(`modalita:${me.id}`, 30, MINUTE)) return { ok: false };
  await prisma.user.update({ where: { id: me.id }, data: { modalita: m.data === 'esperto' ? 'ESPERTO' : 'SEMPLICE' } });
  return { ok: true };
}
