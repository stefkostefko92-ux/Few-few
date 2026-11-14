import { prisma } from '../db.js';
import { setting } from '../admin/settings.js';
import { revolutSettings } from '../admin/integrations.js';
import { BillingError, type Interval } from './billing-core.js';
import { quotePlan, type Quote } from './orders.js';

/**
 * Данните за страницата „План“ (SPEC 49): текущият абонамент, плановете за вида на фирмата с цена от
 * сървъра (без ДДС, ДДС, общо), начините на плащане, които са настроени, и историята с фактурите.
 */
export interface Supplier {
  id: string;
  legalName: string;
  eik: string | null;
  vatNumber: string | null;
  address: string;
  iban: string | null;
  bic: string | null;
}

export function addressLine(org: {
  addressStreet: string;
  postalCode: string;
  addressCity: string;
}) {
  return [org.addressStreet, [org.postalCode, org.addressCity].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
}

/** Доставчикът на плановете (Карбон Стелт) — null, ако не е настроен или няма серия по подразбиране. */
export async function planSupplier(): Promise<Supplier | null> {
  const id = await setting('billing.supplierOrgId');
  if (!id) return null;
  const org = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      legalName: true,
      eik: true,
      vatNumber: true,
      addressStreet: true,
      postalCode: true,
      addressCity: true,
      iban: true,
      bic: true,
      series: { where: { isDefault: true }, select: { id: true }, take: 1 },
    },
  });
  if (!org || org.series.length === 0) return null;
  return {
    id: org.id,
    legalName: org.legalName,
    eik: org.eik,
    vatNumber: org.vatNumber,
    address: addressLine(org),
    iban: org.iban,
    bic: org.bic,
  };
}

/** Начините на плащане, които са настроени: карта — ключ за Revolut; превод — IBAN на доставчика. */
export async function paymentMethods(
  supplier?: Supplier | null,
): Promise<{ card: boolean; transfer: boolean }> {
  const resolved = supplier === undefined ? await planSupplier() : supplier;
  const revolut = await revolutSettings();
  return {
    card: resolved !== null && revolut.secretKey !== null,
    transfer: resolved !== null && resolved.iban !== null,
  };
}

export interface PlanOption {
  code: string;
  name: { bg: string; en: string };
  current: boolean;
  quotes: Partial<Record<Interval, Quote>>;
  /** Периоди, които прихващането покрива изцяло (по-евтин план) — поръчват се след края на платения. */
  deferred: Interval[];
}

export async function planPage(organizationId: string) {
  const [org, current, supplier, history] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { id: true, legalName: true, kind: true },
    }),
    prisma.subscription.findFirst({
      where: { organizationId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { nameBg: true, nameEn: true, priceMonthlyCents: true } } },
    }),
    planSupplier(),
    prisma.payment.findMany({
      // Отказаните и неуспешните поръчки са шум — в историята са чакащата и платените.
      where: {
        organizationId,
        planCode: { not: null },
        status: { in: ['PENDING', 'COMPLETED', 'REFUNDED'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 24,
      select: {
        id: true,
        createdAt: true,
        paidAt: true,
        status: true,
        provider: true,
        planCode: true,
        interval: true,
        amountCents: true,
        reference: true,
        invoiceDocument: { select: { id: true, number: true } },
      },
    }),
  ]);
  const plans = await prisma.plan.findMany({
    where: {
      isActive: true,
      isPublic: true,
      audience: org.kind === 'ACCOUNTING_FIRM' ? 'ACCOUNTANT' : 'COMPANY',
    },
    orderBy: { sortOrder: 'asc' },
    select: { code: true, nameBg: true, nameEn: true },
  });
  const options: PlanOption[] = [];
  for (const plan of plans) {
    const quotes: Partial<Record<Interval, Quote>> = {};
    const deferred: Interval[] = [];
    for (const interval of ['MONTH', 'YEAR'] as const) {
      try {
        quotes[interval] = await quotePlan(organizationId, plan.code, interval);
      } catch (error) {
        // Безплатен план, „по договор“ или нулева сума — няма какво да се плати оттук.
        if (!(error instanceof BillingError)) throw error;
        if (error.code === 'downgrade') deferred.push(interval);
      }
    }
    options.push({
      code: plan.code,
      name: { bg: plan.nameBg, en: plan.nameEn },
      current: current?.planCode === plan.code,
      quotes,
      deferred,
    });
  }
  // Фактурите идват в шкафчето на фирмата — връзката е към записа там.
  const invoiceIds = history.flatMap((p) => (p.invoiceDocument ? [p.invoiceDocument.id] : []));
  const entries = invoiceIds.length
    ? await prisma.inboxEntry.findMany({
        where: { recipientOrgId: organizationId, documentId: { in: invoiceIds } },
        select: { id: true, documentId: true },
      })
    : [];
  const inbox = new Map(entries.map((e) => [e.documentId, e.id]));
  return {
    org,
    current,
    options,
    methods: await paymentMethods(supplier),
    history: history.map((p) => ({
      ...p,
      inboxEntryId: p.invoiceDocument ? (inbox.get(p.invoiceDocument.id) ?? null) : null,
    })),
  };
}
