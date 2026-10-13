import type { Role } from '@prisma/client';
import { prisma } from '../db.js';
import { writeAudit } from '../audit.js';
import { canAssignRole, canManageMembership } from '../auth/manage.js';
import { outranks } from '../auth/roles.js';
import { activeAzienda, isUniqueViolation } from '../aziende/service.js';
import type { SessionUser } from '../types.js';
import { loadTarget } from './users.js';

/**
 * Членствата: в кои фирми е човекът и с каква роля във всяка. Фирми слага и маха само MASTER; ролята в
 * една фирма сменя и администраторът ѝ (само под своята). Човек извън MASTER остава поне в една фирма —
 * за да спре изцяло, се деактивира.
 */

/** Ролята на човека в една фирма. */
export async function changeMembershipRole(
  actor: SessionUser,
  targetId: string,
  aziendaId: string,
  role: Role,
): Promise<boolean> {
  const target = await loadTarget(targetId);
  if (!target || !canManageMembership(actor, target, aziendaId)) return false;
  if (!canAssignRole(actor, aziendaId, role)) return false;
  const current = target.memberships.find((m) => m.aziendaId === aziendaId);
  if (!current) return false;
  if (current.role === role) return true;
  await prisma.$transaction(async (tx) => {
    await tx.membership.update({
      where: { userId_aziendaId: { userId: target.id, aziendaId } },
      data: { role },
    });
    await writeAudit(
      {
        actorId: actor.id,
        action: 'USER_ROLE',
        aziendaId,
        targetType: 'user',
        targetId: target.id,
        meta: { from: current.role, to: role },
      },
      tx,
    );
  });
  return true;
}

export type AddOutcome = 'ok' | 'notAllowed' | 'azienda' | 'exists';

/** Още една фирма за човека, с роля в нея — само MASTER, само за човек извън MASTER, само активна фирма. */
export async function addMembership(
  actor: SessionUser,
  targetId: string,
  aziendaIdRaw: unknown,
  role: Role,
): Promise<AddOutcome> {
  if (!actor.master || !outranks('MASTER', role)) return 'notAllowed';
  const [target, azienda] = await Promise.all([loadTarget(targetId), activeAzienda(aziendaIdRaw)]);
  if (!target || target.master) return 'notAllowed';
  if (!azienda) return 'azienda';
  if (target.memberships.some((m) => m.aziendaId === azienda.id)) return 'exists';
  try {
    await prisma.$transaction(async (tx) => {
      await tx.membership.create({ data: { userId: target.id, aziendaId: azienda.id, role } });
      await writeAudit(
        {
          actorId: actor.id,
          action: 'MEMBERSHIP_ADD',
          aziendaId: azienda.id,
          targetType: 'user',
          targetId: target.id,
          meta: { role },
        },
        tx,
      );
    });
  } catch (error) {
    // Добавена междувременно от друг раздел — първичният ключ (човек, фирма).
    if (isUniqueViolation(error)) return 'exists';
    throw error;
  }
  return 'ok';
}

export type RemoveOutcome = 'ok' | 'notAllowed' | 'last';

/** Маха човека от фирма — само MASTER; последната фирма не се маха (за пълно спиране — деактивиране). */
export async function removeMembership(
  actor: SessionUser,
  targetId: string,
  aziendaId: string,
): Promise<RemoveOutcome> {
  if (!actor.master) return 'notAllowed';
  const target = await loadTarget(targetId);
  if (!target || target.master) return 'notAllowed';
  return prisma.$transaction(async (tx) => {
    // Редът на човека се заключва: две махания наведнъж не могат да оставят човек без фирма.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${target.id} FOR UPDATE`;
    const memberships = await tx.membership.findMany({
      where: { userId: target.id },
      select: { aziendaId: true, role: true },
    });
    const removed = memberships.find((m) => m.aziendaId === aziendaId);
    if (!removed) return 'notAllowed';
    if (memberships.length === 1) return 'last';
    await tx.membership.delete({
      where: { userId_aziendaId: { userId: target.id, aziendaId } },
    });
    await writeAudit(
      {
        actorId: actor.id,
        action: 'MEMBERSHIP_REMOVE',
        aziendaId,
        targetType: 'user',
        targetId: target.id,
        meta: { role: removed.role },
      },
      tx,
    );
    return 'ok';
  });
}
