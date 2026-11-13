import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { randomToken } from '../crypto.js';
import { encryptPeppolHookSecret } from '../auth/keys.js';
import type { OrgAccess } from '../auth/guards.js';
import { AccessPointError, type AccessPoint } from './access-point.js';
import { partyIdForVat } from './ids.js';

/**
 * Фирмата като получател в Peppol (SPEC 57): адрес `9926:BG…`, регистрация при точката за достъп с
 * визитка (име, адрес, държава) и адрес за известията с нова тайна (HMAC). Изключване — отписване.
 * Грешката на доставчика се пази в `lastError` и се показва (без тайни).
 */
export class PeppolError extends Error {
  constructor(
    readonly code: 'notConfigured' | 'noVat' | 'taken' | 'notActive' | 'provider',
    message: string = code,
  ) {
    super(message);
  }
}

export async function participantFor(organizationId: string) {
  return prisma.peppolParticipant.findUnique({ where: { organizationId } });
}

export async function enrollOrganization(
  access: OrgAccess,
  actorId: string,
  ap: AccessPoint | null,
): Promise<'ACTIVE' | 'FAILED'> {
  if (!ap) throw new PeppolError('notConfigured');
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: access.organizationId },
    select: {
      id: true,
      legalName: true,
      vatNumber: true,
      addressStreet: true,
      postalCode: true,
      addressCity: true,
      countryCode: true,
    },
  });
  const partyId = partyIdForVat(org.vatNumber);
  if (!partyId) throw new PeppolError('noVat');
  const other = await prisma.peppolParticipant.findUnique({ where: { partyId } });
  if (other && other.organizationId !== org.id) throw new PeppolError('taken');
  const secret = randomToken(32);
  await prisma.$transaction(async (tx) => {
    await tx.peppolParticipant.upsert({
      where: { organizationId: org.id },
      create: {
        organizationId: org.id,
        partyId,
        status: 'PENDING',
        hookSecretEnc: encryptPeppolHookSecret(secret, org.id),
        createdById: actorId,
      },
      update: {
        partyId,
        status: 'PENDING',
        hookSecretEnc: encryptPeppolHookSecret(secret, org.id),
        lastError: null,
      },
    });
    await audit(tx, {
      actorId,
      organizationId: org.id,
      action: 'peppol.enroll.requested',
      targetType: 'Organization',
      targetId: org.id,
      details: { partyId },
    });
  });
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
    const message =
      error instanceof AccessPointError ? error.message : 'Точката за достъп не отговори';
    await prisma.peppolParticipant.update({
      where: { organizationId: org.id },
      data: { status: 'FAILED', lastError: message.slice(0, 500) },
    });
    return 'FAILED';
  }
  await prisma.$transaction(async (tx) => {
    await tx.peppolParticipant.update({
      where: { organizationId: org.id },
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
