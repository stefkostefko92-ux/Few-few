import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { hashPassword, passwordProblem, PASSWORD_MAX_LENGTH } from '../auth/password.js';
import { isValidBgVat, isValidEik, normalizeVat } from '../einvoice/bg-ids.js';

/** Данните на фирма (своята или фирма-клиент на кантора) — проверени, преди да стигнат до базата. */
export const OrganizationDataSchema = z
  .object({
    legalName: z.string().trim().min(2).max(200),
    eik: z.string().trim().refine(isValidEik, 'invalidEik'),
    vatNumber: z
      .string()
      .trim()
      .transform((value) => (value === '' ? undefined : normalizeVat(value)))
      .optional()
      .refine((value) => value === undefined || isValidBgVat(value), 'invalidVat'),
    addressStreet: z.string().trim().min(3).max(200),
    addressCity: z.string().trim().min(2).max(100),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{4}$/, 'invalidPostalCode'),
    iban: z
      .string()
      .trim()
      .transform((value) => value.replace(/\s/g, '').toUpperCase())
      .refine(
        (value) => value === '' || /^BG\d{2}[A-Z]{4}\d{6}[A-Z0-9]{8}$/.test(value),
        'invalidIban',
      )
      .optional(),
  })
  .refine((data) => !data.vatNumber || data.vatNumber === `BG${data.eik}`, {
    message: 'vatMismatch',
    path: ['vatNumber'],
  });

export const RegistrationSchema = z
  .object({
    kind: z.enum(['company', 'accountant']),
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    password: z.string().max(PASSWORD_MAX_LENGTH),
    acceptTerms: z.literal('on'),
  })
  .and(OrganizationDataSchema);

export type Registration = z.infer<typeof RegistrationSchema>;

export class RegistrationError extends Error {
  constructor(readonly code: 'emailTaken' | 'companyTaken' | `password.${string}`) {
    super(code);
  }
}

/** Серията по подразбиране на нова фирма: целият десетразряден диапазон. */
const DEFAULT_SERIES = { name: 'Основна', rangeStart: 1n, rangeEnd: 9_999_999_999n };

/**
 * Регистрация: човек + фирма (или кантора) + собственик + серия + безплатен план — в една транзакция.
 * Фирма с вече регистриран ЕИК не се създава втори път (кантора, която я обслужва, иска пълномощно).
 */
export async function register(
  data: Registration,
): Promise<{ userId: string; organizationId: string }> {
  const problem = passwordProblem(data.password, [data.email, data.name]);
  if (problem) throw new RegistrationError(`password.${problem}`);
  const passwordHash = await hashPassword(data.password);
  try {
    return await prisma.$transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { email: data.email }, select: { id: true } })) {
        throw new RegistrationError('emailTaken');
      }
      if (await tx.organization.findUnique({ where: { eik: data.eik }, select: { id: true } })) {
        throw new RegistrationError('companyTaken');
      }
      const user = await tx.user.create({
        data: { email: data.email, name: data.name, passwordHash },
      });
      const organization = await tx.organization.create({
        data: {
          kind: data.kind === 'accountant' ? 'ACCOUNTING_FIRM' : 'COMPANY',
          legalName: data.legalName,
          eik: data.eik,
          vatNumber: data.vatNumber ?? null,
          addressStreet: data.addressStreet,
          addressCity: data.addressCity,
          postalCode: data.postalCode,
          iban: data.iban || null,
          eAddressScheme: data.vatNumber ? '9926' : null,
          eAddressValue: data.vatNumber ?? null,
        },
      });
      await tx.membership.create({
        data: { userId: user.id, organizationId: organization.id, role: 'OWNER' },
      });
      await tx.documentSeries.create({
        data: {
          organizationId: organization.id,
          ...DEFAULT_SERIES,
          nextNumber: DEFAULT_SERIES.rangeStart,
          isDefault: true,
        },
      });
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 100);
      await tx.subscription.create({
        data: {
          organizationId: organization.id,
          planCode: data.kind === 'accountant' ? 'firm' : 'free',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });
      await audit(tx, {
        actorId: user.id,
        organizationId: organization.id,
        action: 'account.registered',
        targetType: 'Organization',
        targetId: organization.id,
        details: { kind: data.kind },
      });
      return { userId: user.id, organizationId: organization.id };
    });
  } catch (error) {
    // Състезание на два едновременни записа със същия имейл или ЕИК — уникалният индекс решава.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = String(error.meta?.['target'] ?? '');
      throw new RegistrationError(target.includes('email') ? 'emailTaken' : 'companyTaken');
    }
    throw error;
  }
}
