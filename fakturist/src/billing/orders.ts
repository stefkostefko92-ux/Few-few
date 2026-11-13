import { randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { setting } from '../admin/settings.js';
import { issueSettings } from '../documents/issue.js';
import { addPeriod, issuePlanInvoice } from './plan-invoice.js';
import {
  BillingError,
  VAT_RATE_PERCENT,
  vatCents,
  type Interval,
  type OrderMethod,
} from './billing-core.js';
import { lockOrganization } from '../accounts/transfer-core.js';

/**
 * Поръчка и плащане на план (SPEC 49–50; ДДС — docs/kazus-dds-abonamenti.md). Сумата се смята САМО тук:
 * цената на плана (без ДДС) + ДДС 20 % (всички клиенти засега са български фирми — регистрацията иска
 * ЕИК). Карта → Revolut, активиране само след проверен webhook и повторно четене на поръчката; банков
 * превод → основание „FKT-…“, активиране от мастър панела. Активирането и фактурата от Карбон Стелт
 * (организацията от настройката `billing.supplierOrgId`) са в една транзакция; BT-7 е датата на плащането.
 */
export { BillingError, VAT_RATE_PERCENT, vatCents, type Interval, type OrderMethod };

export interface Quote {
  planCode: string;
  planName: { bg: string; en: string };
  interval: Interval;
  netCents: number;
  vatCents: number;
  totalCents: number;
  clientCompanies: number | null;
}

export async function quotePlan(
  organizationId: string,
  planCode: string,
  interval: Interval,
): Promise<Quote> {
  const [org, plan] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { kind: true } }),
    prisma.plan.findUnique({ where: { code: planCode } }),
  ]);
  if (!org || !plan || !plan.isActive || !plan.isPublic) throw new BillingError('notFound');
  const audience = org.kind === 'ACCOUNTING_FIRM' ? 'ACCOUNTANT' : 'COMPANY';
  if (plan.audience !== audience) throw new BillingError('audience');
  const base = interval === 'YEAR' ? plan.priceYearlyCents : plan.priceMonthlyCents;
  if (base === null) throw new BillingError('noPrice');
  let clients: number | null = null;
  let net = base;
  if (plan.perClientCompanyCents !== null) {
    clients = await prisma.clientMandate.count({
      where: { firmId: organizationId, status: 'ACTIVE' },
    });
    const extra = Math.max(0, clients - (plan.includedClientCompanies ?? 0));
    net += extra * plan.perClientCompanyCents * (interval === 'YEAR' ? 12 : 1);
  }
  if (net <= 0) throw new BillingError('free');
  const vat = vatCents(net);
  return {
    planCode: plan.code,
    planName: { bg: plan.nameBg, en: plan.nameEn },
    interval,
    netCents: net,
    vatCents: vat,
    totalCents: net + vat,
    clientCompanies: clients,
  };
}

/** Основанието за превода: „FKT-“ + 8 знака без лесни за бъркане (0/O, 1/I). */
export function newReference(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  return `FKT-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}

/** Нова поръчка: чакащите поръчки на фирмата се затварят (валидна за плащане е последната). */
export async function createOrder(input: {
  organizationId: string;
  actorId: string;
  planCode: string;
  interval: Interval;
  method: OrderMethod;
}): Promise<{ paymentId: string; reference: string; quote: Quote }> {
  const supplier = await setting('billing.supplierOrgId');
  if (!supplier) throw new BillingError('noSupplier');
  const quote = await quotePlan(input.organizationId, input.planCode, input.interval);
  return prisma.$transaction(async (tx) => {
    await lockOrganization(tx, input.organizationId);
    // Заменената поръчка е CANCELLED, не FAILED: ако все пак се плати (картата е вече в Revolut,
    // преводът — в банката), activatePayment я активира — парите не се губят.
    await tx.payment.updateMany({
      where: { organizationId: input.organizationId, status: 'PENDING', planCode: { not: null } },
      data: { status: 'CANCELLED' },
    });
    const reference = newReference();
    const payment = await tx.payment.create({
      data: {
        organizationId: input.organizationId,
        provider: input.method === 'card' ? 'REVOLUT' : 'MANUAL',
        amountCents: quote.totalCents,
        netCents: quote.netCents,
        vatCents: quote.vatCents,
        vatRate: String(VAT_RATE_PERCENT),
        currency: 'EUR',
        planCode: quote.planCode,
        interval: quote.interval,
        reference,
        createdById: input.actorId,
      },
    });
    await audit(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      action: 'billing.order.created',
      targetType: 'Payment',
      targetId: payment.id,
      details: {
        planCode: quote.planCode,
        interval: quote.interval,
        method: input.method,
        totalCents: quote.totalCents,
      },
    });
    return { paymentId: payment.id, reference, quote };
  });
}

/**
 * Активиране на платена поръчка: плащането COMPLETED, нов абонаментен период (продължава текущия, ако
 * е същият план), фактура от Карбон Стелт с BT-7 = датата на плащането и платената сума (BT-113) — в
 * ЕДНА транзакция; повторно извикване (втори webhook, двойно натискане) не прави нищо.
 */
export async function activatePayment(input: {
  paymentId: string;
  paidAt: Date;
  confirmedById?: string | null;
  expectedAmountCents?: number;
}): Promise<{ activated: boolean; invoiceId: string | null }> {
  const supplierOrgId = await setting('billing.supplierOrgId');
  if (!supplierOrgId) throw new BillingError('noSupplier');
  const settings = await issueSettings();
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Payment" WHERE "id" = ${input.paymentId} FOR UPDATE`;
    if (rows.length !== 1) throw new BillingError('notFound');
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: input.paymentId } });
    if (payment.status !== 'PENDING' && payment.status !== 'CANCELLED') {
      return { activated: false, invoiceId: null };
    }
    if (!payment.planCode || !payment.interval) throw new BillingError('notPending');
    if (
      input.expectedAmountCents !== undefined &&
      input.expectedAmountCents !== payment.amountCents
    ) {
      throw new BillingError('amountMismatch');
    }
    const interval = payment.interval as Interval;
    const [customer, plan] = await Promise.all([
      tx.organization.findUniqueOrThrow({ where: { id: payment.organizationId } }),
      tx.plan.findUniqueOrThrow({ where: { code: payment.planCode } }),
    ]);
    const current = await tx.subscription.findFirst({
      where: { organizationId: customer.id, status: 'ACTIVE' },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    const start =
      current &&
      current.planCode === plan.code &&
      current.interval === interval &&
      current.currentPeriodEnd > input.paidAt
        ? current.currentPeriodEnd
        : input.paidAt;
    const end = addPeriod(start, interval);
    await tx.subscription.updateMany({
      where: { organizationId: customer.id, status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    });
    const subscription = await tx.subscription.create({
      data: {
        organizationId: customer.id,
        planCode: plan.code,
        interval,
        status: 'ACTIVE',
        currentPeriodStart: start,
        currentPeriodEnd: end,
        provider: payment.provider,
        providerRef: payment.providerOrderId,
      },
    });

    const invoiceId = await issuePlanInvoice(tx, {
      supplierOrgId,
      payment,
      customer,
      planName: plan.nameBg,
      interval,
      start,
      end,
      paidAt: input.paidAt,
      settings,
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'COMPLETED',
        paidAt: input.paidAt,
        subscriptionId: subscription.id,
        invoiceDocumentId: invoiceId,
        confirmedById: input.confirmedById ?? null,
      },
    });
    await audit(tx, {
      actorId: input.confirmedById ?? null,
      organizationId: customer.id,
      action: 'billing.payment.completed',
      targetType: 'Payment',
      targetId: payment.id,
      details: {
        provider: payment.provider,
        amountCents: payment.amountCents,
        planCode: plan.code,
        invoiceId,
      },
    });
    return { activated: true, invoiceId };
  });
}
