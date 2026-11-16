import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { consumeTotpCode } from '../auth/step-up.js';
import { isValidBgVat, isValidEik, normalizeVat } from '../einvoice/bg-ids.js';
import { lockOrganization, TransferError } from './transfer-core.js';

/**
 * Данните на фирмата (SPEC 82–83; решение на собственика, 15.11.2026): собственикът (пряк член) и
 * мастърът сменят наименование, адрес, ДДС номер, банка, имейл и телефон; ЕИК — само мастърът с 2FA кода
 * и основание. Издадените документи не се пипат: доставчикът е записан във входа им при издаване.
 */
export class ProfileError extends Error {
  constructor(
    readonly code:
      | 'notFound'
      | 'notOwner'
      | 'terminated'
      | 'invalid'
      | 'peppolActive'
      | 'code'
      | 'reason'
      | 'invalidEik'
      | 'eikTaken',
  ) {
    super(code);
  }
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value));

export const CompanyProfileSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  addressStreet: z.string().trim().min(3).max(200),
  addressCity: z.string().trim().min(2).max(100),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{4}$/),
  vatNumber: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : normalizeVat(value)))
    .refine((value) => value === null || isValidBgVat(value)),
  iban: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s/g, '').toUpperCase())
    .refine((value) => value === '' || /^BG\d{2}[A-Z]{4}\d{6}[A-Z0-9]{8}$/.test(value))
    .transform((value) => (value === '' ? null : value)),
  bic: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s/g, '').toUpperCase())
    .refine((value) => value === '' || /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(value))
    .transform((value) => (value === '' ? null : value)),
  bankName: optionalText(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine((value) => value === '' || z.email().safeParse(value).success)
    .transform((value) => (value === '' ? null : value)),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((value) => value === '' || /^[+0-9 ()-]{6,30}$/.test(value))
    .transform((value) => (value === '' ? null : value)),
});

export const PROFILE_FIELDS = [
  'legalName',
  'addressStreet',
  'addressCity',
  'postalCode',
  'vatNumber',
  'iban',
  'bic',
  'bankName',
  'email',
  'phone',
] as const;

type Tx = Prisma.TransactionClient;

async function lockOrg(tx: Tx, organizationId: string) {
  try {
    await lockOrganization(tx, organizationId);
  } catch (error) {
    if (error instanceof TransferError) throw new ProfileError('notFound');
    throw error;
  }
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (org.deletedAt) throw new ProfileError('notFound');
  if (org.terminatedAt) throw new ProfileError('terminated');
  return org;
}

export async function updateCompanyProfile(input: {
  organizationId: string;
  actor: { userId: string; master: boolean };
  input: Record<string, unknown>;
}): Promise<{ changed: string[] }> {
  const parsed = CompanyProfileSchema.safeParse(input.input);
  if (!parsed.success) throw new ProfileError('invalid');
  const data = parsed.data;
  return prisma.$transaction(async (tx) => {
    const org = await lockOrg(tx, input.organizationId);
    if (input.actor.master) {
      const master = await tx.user.findUnique({
        where: { id: input.actor.userId },
        select: { platformRole: true },
      });
      if (master?.platformRole !== 'MASTER') throw new ProfileError('notOwner');
    } else {
      const member = await tx.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: input.actor.userId,
            organizationId: input.organizationId,
          },
        },
        select: { role: true },
      });
      if (member?.role !== 'OWNER') throw new ProfileError('notOwner');
    }
    // ДДС номерът на българско ЮЛ е „BG“ + ЕИК (като при регистрацията).
    if (data.vatNumber && data.vatNumber !== `BG${org.eik ?? ''}`)
      throw new ProfileError('invalid');
    const changed = PROFILE_FIELDS.filter((field) => (org[field] ?? null) !== data[field]);
    if (changed.length === 0) return { changed };
    // Адресът в Peppol е от ДДС номера — първо изключване (SPEC 82).
    if (changed.includes('vatNumber')) {
      const peppol = await tx.peppolParticipant.findUnique({
        where: { organizationId: input.organizationId },
        select: { status: true },
      });
      if (peppol && (peppol.status === 'ACTIVE' || peppol.status === 'PENDING')) {
        throw new ProfileError('peppolActive');
      }
    }
    await tx.organization.update({
      where: { id: input.organizationId },
      data: Object.fromEntries(changed.map((field) => [field, data[field]])),
    });
    await audit(tx, {
      actorId: input.actor.userId,
      organizationId: input.organizationId,
      action: 'organization.profile.updated',
      targetType: 'Organization',
      targetId: input.organizationId,
      details: { fields: changed, byMaster: input.actor.master },
    });
    return { changed };
  });
}

/** ЕИК — само мастърът: 2FA кодът (еднократен), основание 3–200 знака, валиден и свободен ЕИК. */
export async function changeCompanyEik(input: {
  organizationId: string;
  actorId: string;
  code: string;
  reason: string;
  eik: string;
}): Promise<void> {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 200) throw new ProfileError('reason');
  const eik = input.eik.trim();
  if (!isValidEik(eik)) throw new ProfileError('invalidEik');
  try {
    await prisma.$transaction(async (tx) => {
      const org = await lockOrg(tx, input.organizationId);
      const master = await tx.user.findUnique({
        where: { id: input.actorId },
        select: { platformRole: true },
      });
      if (master?.platformRole !== 'MASTER') throw new ProfileError('notOwner');
      if (!(await consumeTotpCode(tx, input.actorId, input.code))) throw new ProfileError('code');
      if (org.eik === eik) return;
      const taken = await tx.organization.count({ where: { eik, id: { not: org.id } } });
      if (taken > 0) throw new ProfileError('eikTaken');
      // ДДС номерът следва ЕИК, ако е бил „BG“ + стария.
      const vatNumber =
        org.vatNumber && org.vatNumber === `BG${org.eik ?? ''}` ? `BG${eik}` : org.vatNumber;
      await tx.organization.update({ where: { id: org.id }, data: { eik, vatNumber } });
      const owners = await tx.membership.findMany({
        where: { organizationId: org.id, role: 'OWNER', user: { disabledAt: null } },
        select: { user: { select: { email: true } } },
      });
      for (const owner of owners) {
        await tx.notification.create({
          data: {
            organizationId: org.id,
            kind: 'org.eikChanged',
            toEmail: owner.user.email,
            payload: { legalName: org.legalName, eik },
          },
        });
      }
      await audit(tx, {
        actorId: input.actorId,
        organizationId: org.id,
        action: 'organization.eik.changed',
        targetType: 'Organization',
        targetId: org.id,
        details: { from: org.eik, to: eik, reason },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ProfileError('eikTaken');
    }
    throw error;
  }
}
