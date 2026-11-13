import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { randomToken } from '../crypto.js';
import { MINUTE } from '../time.js';
import { encryptPeppolHookSecret } from '../auth/keys.js';
import { scrub } from '../admin/integration-checks.js';
import type { OrgAccess } from '../auth/guards.js';
import { AccessPointError, type AccessPoint } from './access-point.js';
import { partyIdForVat } from './ids.js';

/**
 * Фирмата като получател в Peppol (SPEC 57): адрес `9926:BG…`, регистрация при точката за достъп с
 * визитка (име, адрес, държава) и адрес за известията с нова тайна (HMAC). Изключване — отписване.
 * Грешката на доставчика се пази в `lastError` и се показва (без тайни).
 *
 * Регистрираме от наше име (ApManager) адрес, изведен от ДДС номера, който фирмата сама е въвела —
 * затова само фирма, потвърдена от мастъра (`verifiedAt`), иначе всеки би получавал чужди фактури.
 */
export class PeppolError extends Error {
  constructor(
    readonly code:
      | 'notConfigured'
      | 'noVat'
      | 'notVerified'
      | 'taken'
      | 'alreadyActive'
      | 'busy'
      | 'notActive'
      | 'provider',
    message: string = code,
  ) {
    super(message);
  }
}

/** Регистрация, която е „PENDING“ по-дълго от това, е прекъсната (паднал процес) и може да се поеме. */
export const ENROLL_LEASE_MS = 5 * MINUTE;

export async function participantFor(organizationId: string) {
  return prisma.peppolParticipant.findUnique({ where: { organizationId } });
}

/**
 * Заема регистрацията: само една заявка минава в PENDING и само тя сменя тайната. Действаща регистрация
 * не се пипа (повторното „Включи“ би сменило тайната и би спряло известията); друга заявка в ход → `busy`.
 */
async function claimEnrollment(input: {
  organizationId: string;
  partyId: string;
  hookSecretEnc: string;
  actorId: string;
  now: Date;
}): Promise<void> {
  const data = {
    partyId: input.partyId,
    status: 'PENDING' as const,
    hookSecretEnc: input.hookSecretEnc,
    lastError: null,
  };
  const claimed = await prisma.peppolParticipant.updateMany({
    where: {
      organizationId: input.organizationId,
      OR: [
        { status: { in: ['FAILED', 'REMOVED'] } },
        {
          status: 'PENDING',
          updatedAt: { lt: new Date(input.now.getTime() - ENROLL_LEASE_MS) },
        },
      ],
    },
    data,
  });
  if (claimed.count === 1) return;
  const current = await participantFor(input.organizationId);
  if (current?.status === 'ACTIVE') throw new PeppolError('alreadyActive');
  if (current) throw new PeppolError('busy');
  try {
    await prisma.peppolParticipant.create({
      data: { organizationId: input.organizationId, ...data, createdById: input.actorId },
    });
  } catch (error) {
    // Друга заявка създаде записа междувременно (уникален organizationId / partyId).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await participantFor(input.organizationId);
      if (!raced) throw new PeppolError('taken');
      throw new PeppolError(raced.status === 'ACTIVE' ? 'alreadyActive' : 'busy');
    }
    throw error;
  }
}

export async function enrollOrganization(
  access: OrgAccess,
  actorId: string,
  ap: AccessPoint | null,
  now = new Date(),
): Promise<'ACTIVE' | 'FAILED'> {
  if (!ap) throw new PeppolError('notConfigured');
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: access.organizationId },
    select: {
      id: true,
      legalName: true,
      vatNumber: true,
      verifiedAt: true,
      addressStreet: true,
      postalCode: true,
      addressCity: true,
      countryCode: true,
    },
  });
  const partyId = partyIdForVat(org.vatNumber);
  if (!partyId) throw new PeppolError('noVat');
  if (!org.verifiedAt) throw new PeppolError('notVerified');
  const other = await prisma.peppolParticipant.findUnique({ where: { partyId } });
  if (other && other.organizationId !== org.id) throw new PeppolError('taken');
  const secret = randomToken(32);
  await claimEnrollment({
    organizationId: org.id,
    partyId,
    hookSecretEnc: encryptPeppolHookSecret(secret, org.id),
    actorId,
    now,
  });
  await prisma.$transaction((tx) =>
    audit(tx, {
      actorId,
      organizationId: org.id,
      action: 'peppol.enroll.requested',
      targetType: 'Organization',
      targetId: org.id,
      details: { partyId },
    }),
  );
  try {
    await ap.enroll({
      partyId,
      name: org.legalName,
      address: [org.addressStreet, [org.postalCode, org.addressCity].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', '),
      countryCode: org.countryCode || 'BG',
      hookUrl: `${config().PUBLIC_BASE_URL}/webhooks/peppol#${secret}`,
    });
  } catch (error) {
    // Тайната остава новата: при изтекла заявка доставчикът може вече да я е записал; старата е била
    // на неуспешна или изключена регистрация. Следващото успешно „Включи“ решава окончателно.
    const message = scrub(
      error instanceof AccessPointError ? error.message : 'Точката за достъп не отговори',
      [secret],
    );
    await prisma.peppolParticipant.updateMany({
      where: { organizationId: org.id, status: 'PENDING' },
      data: { status: 'FAILED', lastError: message.slice(0, 500) },
    });
    return 'FAILED';
  }
  await prisma.$transaction(async (tx) => {
    await tx.peppolParticipant.updateMany({
      where: { organizationId: org.id, status: 'PENDING' },
      data: { status: 'ACTIVE', enrolledAt: new Date(), lastError: null },
    });
    await audit(tx, {
      actorId,
      organizationId: org.id,
      action: 'peppol.enroll.active',
      targetType: 'Organization',
      targetId: org.id,
      details: { partyId },
    });
  });
  return 'ACTIVE';
}

export async function disableOrganization(
  access: OrgAccess,
  actorId: string,
  ap: AccessPoint | null,
): Promise<void> {
  const participant = await participantFor(access.organizationId);
  if (!participant || participant.status === 'REMOVED') throw new PeppolError('notActive');
  if (!ap) throw new PeppolError('notConfigured');
  try {
    await ap.unenroll(participant.partyId);
  } catch (error) {
    const message =
      error instanceof AccessPointError ? error.message : 'Точката за достъп не отговори';
    await prisma.peppolParticipant.update({
      where: { id: participant.id },
      data: { lastError: message.slice(0, 500) },
    });
    throw new PeppolError('provider', message);
  }
  await prisma.$transaction(async (tx) => {
    await tx.peppolParticipant.update({
      where: { id: participant.id },
      data: { status: 'REMOVED', hookSecretEnc: null, lastError: null },
    });
    await audit(tx, {
      actorId,
      organizationId: access.organizationId,
      action: 'peppol.disabled',
      targetType: 'Organization',
      targetId: access.organizationId,
      details: { partyId: participant.partyId },
    });
  });
}
