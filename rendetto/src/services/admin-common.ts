import type { Role, User } from '@prisma/client';
import type { AuditActor } from '../audit.js';
import { prisma } from '../db.js';
import { can, outranks, type Capability } from '../auth/rbac.js';
import { isLocale, type Locale } from '../i18n.js';

/** Човекът от персонала, който действа: ролята му решава какво може. */
export interface StaffActor extends AuditActor {
  id: string;
  role: Role;
}

export type ActionResult = { ok: true; id?: string } | { ok: false; key: string };

export const fail = (key: string): ActionResult => ({ ok: false, key });

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

export function localeOf(user: User): Locale {
  return isLocale(user.locale) ? user.locale : 'bg';
}
