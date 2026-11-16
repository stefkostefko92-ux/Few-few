import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { sha256Hex } from '../crypto.js';
import { hashPassword, passwordProblem } from '../auth/password.js';
import { recordRegistrationAcceptance } from '../legal/acceptance.js';
import {
  isFirmMember,
  isOpen,
  lockOrganization,
  ownerCount,
  TOKEN,
  TransferError,
} from './transfer-core.js';
import type { Locale } from '../i18n.js';
import { isOwner } from './transfer-open.js';

/** Нов профил — на езика на страницата, от която е приета поканата. */
type Acceptor = { userId: string } | { name: string; password: string; locale?: Locale };

/**
 * Приемане: само с имейла от поканата. Вписан човек — неговият профил; без вход — нов профил, ако няма
 * такъв с този имейл (иначе първо вход). Всичко в една транзакция със заключена фирма: поканата се
 * „заема“ с условен UPDATE — две едновременни приемания не минават и двете. Собствеността е на
 * приелия; ако поканата е от кантора и `confirmMandate`, нейното пълномощно става ACTIVE.
 */
export async function acceptTransferInvite(input: {
  token: string;
  user: Acceptor;
  confirmMandate?: boolean;
  now?: Date;
}): Promise<{ userId: string; organizationId: string; created: boolean }> {
  const now = input.now ?? new Date();
  if (!TOKEN.test(input.token)) throw new TransferError('invalid');
  const tokenHash = sha256Hex(input.token);
  const pre = await prisma.transferInvite.findUnique({
    where: { tokenHash },
    select: { email: true },
  });
  if (!pre) throw new TransferError('invalid');

  // Хешът на паролата е бавен (Argon2id) — смята се преди заключването на фирмата.
  let newUser: { name: string; passwordHash: string; locale: Locale } | null = null;
  if ('password' in input.user) {
    const name = input.user.name.trim();
    if (name.length < 2 || name.length > 100) throw new TransferError('invalidName');
    const problem = passwordProblem(input.user.password, [pre.email, name]);
    if (problem) throw new TransferError(`password.${problem}`);
    const locale = input.user.locale ?? 'bg';
    newUser = { name, passwordHash: await hashPassword(input.user.password), locale };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const invite = await tx.transferInvite.findUniqueOrThrow({
        where: { tokenHash },
        include: {
          mandate: { select: { id: true, firmId: true, status: true } },
          fromUser: { select: { email: true } },
        },
      });
      await lockOrganization(tx, invite.organizationId);
      const org = await tx.organization.findUniqueOrThrow({
        where: { id: invite.organizationId },
        select: { deletedAt: true, terminatedAt: true, legalName: true },
      });
      if (!isOpen(invite, now) || org.deletedAt || org.terminatedAt) {
        throw new TransferError('invalid');
      }
      // Покана на кантора по пълномощно, което вече е оттеглено, не дава собственост.
      if (
        invite.mandateId &&
        invite.mandate?.status !== 'PENDING' &&
        invite.mandate?.status !== 'ACTIVE'
      ) {
        throw new TransferError('invalid');
      }
      // Предаване (SPEC 85): предаващият още е собственик; иначе — покана към фирма без собственик.
      if (invite.fromUserId) {
        if (!(await isOwner(tx, invite.fromUserId, invite.organizationId))) {
          throw new TransferError('invalid');
        }
      } else if ((await ownerCount(tx, invite.organizationId)) > 0) {
        throw new TransferError('invalid');
      }
      // Служител на поканилата кантора не става собственик на клиента ѝ.
      if (invite.mandate && (await isFirmMember(tx, invite.mandate.firmId, invite.email))) {
        throw new TransferError('firmMember');
      }

      let userId: string;
      if (newUser) {
        if (await tx.user.findUnique({ where: { email: invite.email }, select: { id: true } })) {
          throw new TransferError('loginRequired');
        }
        const user = await tx.user.create({
          data: {
            email: invite.email,
            name: newUser.name,
            passwordHash: newUser.passwordHash,
            locale: newUser.locale,
            emailVerifiedAt: now,
          },
        });
        userId = user.id;
        // Новият профил прие условията и договора за обработване с отметката на поканата (SPEC 35).
        await recordRegistrationAcceptance(tx, {
          userId,
          organizationId: invite.organizationId,
          now,
        });
      } else {
        const id = 'userId' in input.user ? input.user.userId : '';
        const user = await tx.user.findUnique({ where: { id } });
        if (!user || user.disabledAt) throw new TransferError('invalid');
        if (user.email !== invite.email) throw new TransferError('wrongEmail');
        userId = user.id;
        // Връзката от писмото доказва, че имейлът е негов.
        if (!user.emailVerifiedAt) {
          await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now } });
        }
      }

      const claimed = await tx.transferInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now, acceptedById: userId },
      });
      if (claimed.count !== 1) throw new TransferError('invalid');

      await tx.membership.upsert({
        where: { userId_organizationId: { userId, organizationId: invite.organizationId } },
        create: { userId, organizationId: invite.organizationId, role: 'OWNER' },
        update: { role: 'OWNER' },
      });
      // Предаващият остава администратор (решение на собственика, 16.11.2026) и получава писмо.
      if (invite.fromUserId && invite.fromUserId !== userId) {
        await tx.membership.update({
          where: {
            userId_organizationId: {
              userId: invite.fromUserId,
              organizationId: invite.organizationId,
            },
          },
          data: { role: 'ADMIN' },
        });
        if (invite.fromUser) {
          const acceptor = await tx.user.findUniqueOrThrow({
            where: { id: userId },
            select: { name: true },
          });
          await tx.notification.create({
            data: {
              organizationId: invite.organizationId,
              kind: 'handover.accepted',
              toEmail: invite.fromUser.email,
              payload: { legalName: org.legalName, newOwnerName: acceptor.name },
            },
          });
        }
      }
      // Фирмата, добавена от кантора, няма собствен план — получава безплатния, както при регистрация.
      const active = await tx.subscription.findFirst({
        where: { organizationId: invite.organizationId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!active) {
        const periodEnd = new Date(now);
        periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 100);
        await tx.subscription.create({
          data: {
            organizationId: invite.organizationId,
            planCode: 'free',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });
      }
      await audit(tx, {
        actorId: userId,
        organizationId: invite.organizationId,
        action: invite.fromUserId
          ? 'organization.handover.accepted'
          : 'organization.transfer.accepted',
        targetType: 'TransferInvite',
        targetId: invite.id,
        details: { newAccount: newUser !== null },
      });
      // Собственикът потвърждава пълномощното на поканилата кантора — само ако то още чака.
      if (input.confirmMandate && invite.mandate) {
        const approved = await tx.clientMandate.updateMany({
          where: { id: invite.mandate.id, status: 'PENDING' },
          data: { status: 'ACTIVE' },
        });
        if (approved.count === 1) {
          await audit(tx, {
            actorId: userId,
            organizationId: invite.organizationId,
            action: 'mandate.approved',
            targetType: 'ClientMandate',
            targetId: invite.mandate.id,
            details: { firmId: invite.mandate.firmId, byMaster: false, viaInvite: true },
          });
        }
      }
      // Собственик, поканен от кантора, е за проверка (таблото + писмо до мастърите, без имейла му);
      // поканен от мастъра — проверен е, а заключването след отнемане пада.
      await tx.organization.update({
        where: { id: invite.organizationId },
        data: invite.mandate
          ? { ownerReviewPendingAt: now }
          : { ownerReviewPendingAt: null, ownershipLockedAt: null },
      });
      if (invite.mandate) {
        const masters = await tx.user.findMany({
          where: { platformRole: 'MASTER', disabledAt: null },
          select: { email: true },
        });
        for (const master of masters) {
          await tx.notification.create({
            data: {
              organizationId: invite.organizationId,
              kind: 'ownership.review',
              toEmail: master.email,
              payload: { organizationId: invite.organizationId, inviteId: invite.id },
            },
          });
        }
      }
      return { userId, organizationId: invite.organizationId, created: newUser !== null };
    });
  } catch (error) {
    // Две покани (за различни фирми) към един нов имейл, приети едновременно: заключването е по фирма,
    // затова решава уникалният индекс — вторият вече има профил и трябва да влезе.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new TransferError('loginRequired');
    }
    throw error;
  }
}
