import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { randomToken, sha256Hex } from '../crypto.js';
import { encryptInviteToken } from '../auth/keys.js';
import { setting } from '../admin/settings.js';
import { DAY } from '../time.js';
import {
  EmailSchema,
  INVITE_TTL_MS,
  isFirmMember,
  lockOrganization,
  ownerCount,
  TransferError,
} from './transfer-core.js';

/**
 * Собствеността на фирма, добавена от счетоводна кантора, е на собственика ѝ. Регистрация с ЕИК на
 * такава фирма се отказва (`companyManaged`), иначе всеки би взел чужда фирма с документите ѝ. Затова
 * собственикът получава еднократна покана до имейла си — от кантората, която води счетоводството (при
 * добавяне на фирмата или по-късно), или от мастъра след проверка на документ за представителство. Той я
 * приема (transfer-accept.ts) и става OWNER; кантората работи по пълномощно, след като той го потвърди.
 */
export { INVITE_TTL_MS, TransferError, type TransferErrorCode } from './transfer-core.js';
export { acceptTransferInvite, findOpenInvite, type OpenInvite } from './transfer-accept.js';

interface InviteResult {
  inviteId: string;
  token: string;
  expiresAt: Date;
}

/**
 * Нова покана в транзакцията на извикващия: само за фирма без собственик. Предишните отворени покани и
 * непратените им писма се отменят. В поканата е само SHA-256 на токена; писмото в опашката го носи
 * шифрован.
 */
async function inviteOwnerTx(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    email: string;
    actorId: string;
    mandateId: string | null;
    now: Date;
  },
): Promise<InviteResult> {
  const parsed = EmailSchema.safeParse(input.email);
  if (!parsed.success) throw new TransferError('invalidEmail');
  const email = parsed.data;
  const token = randomToken(32);
  const expiresAt = new Date(input.now.getTime() + INVITE_TTL_MS);
  await lockOrganization(tx, input.organizationId);
  const org = await tx.organization.findUniqueOrThrow({
    where: { id: input.organizationId },
    select: { deletedAt: true },
  });
  if (org.deletedAt) throw new TransferError('notFound');
  if ((await ownerCount(tx, input.organizationId)) > 0) throw new TransferError('hasOwner');
  const replaced = await tx.transferInvite.updateMany({
    where: { organizationId: input.organizationId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: input.now },
  });
  await tx.notification.updateMany({
    where: { organizationId: input.organizationId, kind: 'transfer.invite', status: 'PENDING' },
    data: { status: 'FAILED', lastError: 'Поканата е заменена с нова.' },
  });
  const invite = await tx.transferInvite.create({
    data: {
      organizationId: input.organizationId,
      email,
      tokenHash: sha256Hex(token),
      createdById: input.actorId,
      createdAt: input.now,
      expiresAt,
      mandateId: input.mandateId,
    },
  });
  await tx.notification.create({
    data: {
      organizationId: input.organizationId,
      kind: 'transfer.invite',
      toEmail: email,
      payload: { inviteId: invite.id, tokenEnc: encryptInviteToken(token, invite.id) },
    },
  });
  await audit(tx, {
    actorId: input.actorId,
    organizationId: input.organizationId,
    action: 'organization.transfer.invited',
    targetType: 'TransferInvite',
    targetId: invite.id,
    details: { replaced: replaced.count, byFirm: input.mandateId !== null },
  });
  return { inviteId: invite.id, token, expiresAt };
}

/** Мастърът: покана след проверка на документ за представителство (без пълномощно). */
export async function createTransferInvite(input: {
  organizationId: string;
  email: string;
  actorId: string;
  now?: Date;
}): Promise<InviteResult> {
  return prisma.$transaction((tx) =>
    inviteOwnerTx(tx, { ...input, mandateId: null, now: input.now ?? new Date() }),
  );
}

/**
 * Кантората кани собственика на фирмата, която води по пълномощно (чакащо или действащо — не
 * оттеглено). Правото (OWNER/ADMIN на кантората) се проверява в маршрута. Поканата не може да е за
 * служител на кантората, а броят им за 24 часа е с таван (`invites.firmDailyLimit`) — пощата не е
 * инструмент за масови писма.
 */
export async function inviteOwnerByFirm(
  tx: Prisma.TransactionClient,
  input: { firmId: string; clientId: string; email: string; actorId: string; now?: Date },
): Promise<InviteResult> {
  const now = input.now ?? new Date();
  const mandate = await tx.clientMandate.findUnique({
    where: { firmId_clientId: { firmId: input.firmId, clientId: input.clientId } },
    select: { id: true, status: true },
  });
  if (!mandate || mandate.status === 'REVOKED') throw new TransferError('notFound');
  const email = EmailSchema.safeParse(input.email);
  if (!email.success) throw new TransferError('invalidEmail');
  if (await isFirmMember(tx, input.firmId, email.data)) throw new TransferError('firmMember');
  const sent = await tx.transferInvite.count({
    where: { mandate: { firmId: input.firmId }, createdAt: { gt: new Date(now.getTime() - DAY) } },
  });
  if (sent >= (await setting('invites.firmDailyLimit'))) throw new TransferError('rateLimited');
  return inviteOwnerTx(tx, {
    organizationId: input.clientId,
    email: email.data,
    actorId: input.actorId,
    mandateId: mandate.id,
    now,
  });
}

export async function revokeTransferInvite(input: {
  inviteId: string;
  actorId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const invite = await tx.transferInvite.findUnique({ where: { id: input.inviteId } });
    if (!invite) throw new TransferError('notFound');
    const revoked = await tx.transferInvite.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) throw new TransferError('invalid');
    await tx.notification.updateMany({
      where: { organizationId: invite.organizationId, kind: 'transfer.invite', status: 'PENDING' },
      data: { status: 'FAILED', lastError: 'Поканата е отменена.' },
    });
    await audit(tx, {
      actorId: input.actorId,
      organizationId: invite.organizationId,
      action: 'organization.transfer.revoked',
      targetType: 'TransferInvite',
      targetId: invite.id,
    });
  });
}

const openWhere = (now: Date) => ({ acceptedAt: null, revokedAt: null, expiresAt: { gt: now } });

/** За картата на фирмата в мастър панела: има ли собственик и чакаща покана. */
export async function transferStatus(organizationId: string): Promise<{
  hasOwner: boolean;
  openInvite: { id: string; email: string; expiresAt: Date } | null;
}> {
  const [owners, invite] = await Promise.all([
    ownerCount(prisma, organizationId),
    prisma.transferInvite.findFirst({
      where: { organizationId, ...openWhere(new Date()) },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, expiresAt: true },
    }),
  ]);
  return { hasOwner: owners > 0, openInvite: invite };
}

export interface ClientOwnerStatus {
  hasOwner: boolean;
  /** Чакаща покана; имейлът се вижда само ако е от същата кантора. */
  invite: { email: string | null; expiresAt: Date } | null;
}

/** За началната страница на кантората: кой клиент има собственик и кой чака покана. */
export async function clientOwnerStatus(
  firmIds: readonly string[],
  clientIds: readonly string[],
): Promise<Map<string, ClientOwnerStatus>> {
  const [owners, invites] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: { in: [...clientIds] }, role: 'OWNER' },
      select: { organizationId: true },
    }),
    prisma.transferInvite.findMany({
      where: { organizationId: { in: [...clientIds] }, ...openWhere(new Date()) },
      select: {
        organizationId: true,
        email: true,
        expiresAt: true,
        mandate: { select: { firmId: true } },
      },
    }),
  ]);
  const owned = new Set(owners.map((o) => o.organizationId));
  const result = new Map<string, ClientOwnerStatus>();
  for (const clientId of clientIds) {
    const invite = invites.find((i) => i.organizationId === clientId);
    result.set(clientId, {
      hasOwner: owned.has(clientId),
      invite: invite
        ? {
            email: invite.mandate && firmIds.includes(invite.mandate.firmId) ? invite.email : null,
            expiresAt: invite.expiresAt,
          }
        : null,
    });
  }
  return result;
}
