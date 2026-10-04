import { Prisma, type Role, type User } from '@prisma/client';
import type { AuditActor } from '../audit.js';
import { prisma } from '../db.js';
import { can, outranks, type Capability } from '../auth/rbac.js';

/** Човекът от персонала, който действа: ролята му решава какво може. */
export interface StaffActor extends AuditActor {
  id: string;
  role: Role;
}

export type ActionResult = { ok: true; id?: string } | { ok: false; key: string };

export const fail = (key: string): ActionResult => ({ ok: false, key });

/**
 * Зает уникален ключ (P2002): проверката „имейлът свободен ли е“ и записът не са атомни — адрес,
 * записан междувременно от друга заявка, получава същия отговор като при проверката, не 500.
 */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Защита в дълбочина: маршрутът вече е проверил способността, но услугата проверява пак —
 * плюс правилото, че никой не управлява себе си или равна/по-висока роля.
 */
export async function targetFor(
  actor: StaffActor,
  id: string,
  capability: Capability,
): Promise<User | ActionResult> {
  if (!can(actor.role, capability)) return fail('error.noCapability');
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return fail('admin.errors.notFound');
  if (user.id === actor.id) return fail('admin.errors.self');
  if (!outranks(actor.role, user.role)) return fail('admin.errors.rank');
  return user;
}

export function isResult(value: User | ActionResult): value is ActionResult {
  return 'ok' in value;
}
