import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { randomToken } from '../crypto.js';
import { hashPassword } from '../auth/password.js';
import { consumeTotpCode } from '../auth/step-up.js';
import { issueToken } from './tokens.js';

/**
 * Мастър ролята от панела (решение на собственика, 13.11.2026). Всяко даване и отнемане се потвърждава с
 * 2FA кода на действащия мастър; сесиите на засегнатия се прекратяват (влиза наново — с новите права и
 * задължителен 2FA); последният активен мастър не се маха. Нов имейл → профил без използваема парола +
 * връзка „нова парола“ (1 час; после — „Забравена парола“). Всичко е в одита и в писмо до засегнатия.
 */
export class MasterError extends Error {
  constructor(
    readonly code: 'badCode' | 'disabled' | 'already' | 'notMaster' | 'lastMaster' | 'nameRequired',
  ) {
    super(code);
  }
}

/** Сериализира промените на мастър ролята (броят на мастърите не се разминава при едновременни заявки). */
const MASTERS_LOCK = 4_340_021;

/** Всеки активен мастър научава за промяната — тихо добавен мастър не остава незабелязан. */
async function noticeToMasters(
  tx: Prisma.TransactionClient,
  input: { except: string[]; action: 'granted' | 'revoked'; email: string },
): Promise<void> {
  const masters = await tx.user.findMany({
    where: { platformRole: 'MASTER', disabledAt: null, id: { notIn: input.except } },
    select: { email: true },
  });
  if (masters.length === 0) return;
  await tx.notification.createMany({
    data: masters.map((m) => ({
      kind: 'master.notice',
      toEmail: m.email,
      payload: { action: input.action, email: input.email },
    })),
  });
}

export async function listMasters() {
  return prisma.user.findMany({
    where: { platformRole: 'MASTER' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      name: true,
      totpEnabledAt: true,
      lastLoginAt: true,
      disabledAt: true,
      createdAt: true,
    },
  });
}

export async function grantMaster(input: {
  actorId: string;
  email: string;
  name: string;
  code: string;
}): Promise<{ userId: string; created: boolean }> {
  const email = input.email.trim().toLowerCase();
  // Хешът се смята извън транзакцията (бавен е); паролата е случайна и никой не я знае.
  const unusable = await hashPassword(randomToken(32));
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${MASTERS_LOCK})`;
    if (!(await consumeTotpCode(tx, input.actorId, input.code))) throw new MasterError('badCode');
    const existing = await tx.user.findUnique({ where: { email } });
    let userId: string;
    let created = false;
    if (existing) {
      if (existing.disabledAt) throw new MasterError('disabled');
      if (existing.platformRole === 'MASTER') throw new MasterError('already');
      await tx.user.update({ where: { id: existing.id }, data: { platformRole: 'MASTER' } });
      await tx.session.deleteMany({ where: { userId: existing.id } });
      userId = existing.id;
    } else {
      const name = input.name.trim();
      if (name.length < 2) throw new MasterError('nameRequired');
      const user = await tx.user.create({
        data: { email, name, passwordHash: unusable, platformRole: 'MASTER' },
      });
      userId = user.id;
      created = true;
      await issueToken(tx, { userId, email, purpose: 'PASSWORD_RESET' });
    }
    await tx.notification.create({
      data: { kind: 'master.granted', toEmail: email, payload: { created } },
    });
    await noticeToMasters(tx, { except: [userId], action: 'granted', email });
    await audit(tx, {
      actorId: input.actorId,
      action: 'master.granted',
      targetType: 'User',
      targetId: userId,
      details: { created },
    });
    return { userId, created };
  });
}

export async function revokeMaster(input: {
  actorId: string;
  userId: string;
  code: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${MASTERS_LOCK})`;
    if (!(await consumeTotpCode(tx, input.actorId, input.code))) throw new MasterError('badCode');
    const target = await tx.user.findUnique({ where: { id: input.userId } });
    if (!target || target.platformRole !== 'MASTER') throw new MasterError('notMaster');
    const others = await tx.user.count({
      where: { platformRole: 'MASTER', disabledAt: null, id: { not: target.id } },
    });
    if (others === 0) throw new MasterError('lastMaster');
    await tx.user.update({ where: { id: target.id }, data: { platformRole: 'NONE' } });
    await tx.session.deleteMany({ where: { userId: target.id } });
    await tx.notification.create({
      data: { kind: 'master.revoked', toEmail: target.email, payload: {} },
    });
    await noticeToMasters(tx, { except: [target.id], action: 'revoked', email: target.email });
    await audit(tx, {
      actorId: input.actorId,
      action: 'master.revoked',
      targetType: 'User',
      targetId: target.id,
    });
  });
}
