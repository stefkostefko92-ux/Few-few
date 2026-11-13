import type { Prisma } from '@prisma/client';
import { issueInTx, type IssueRequest, type IssueSettings } from '../documents/issue.js';
import { lockOrganization } from '../accounts/transfer-core.js';
import { BillingError, VAT_RATE_PERCENT, type Interval } from './billing-core.js';
import { sofiaToday } from '../time.js';

/**
 * Фактурата за платен план (SPEC 50): издава я Карбон Стелт (организацията от `billing.supplierOrgId`)
 * от името на собственика си, по серията си по подразбиране, в транзакцията на активирането. BT-7 е
 * датата на плащането (чл. 25, ал. 7 ЗДДС); платената сума е BT-113 → за плащане 0.
 */
// Датите на фактурата са по българско време: плащане в 00:30 на 1-во число е в новия данъчен период.
const isoDay = (date: Date) => sofiaToday(date);
export const bgDay = (date: Date) => isoDay(date).split('-').reverse().join('.');

function cents(value: number): string {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}

export function addPeriod(from: Date, interval: Interval): Date {
  const end = new Date(from);
  if (interval === 'YEAR') end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

export async function issuePlanInvoice(
  tx: Prisma.TransactionClient,
  input: {
    supplierOrgId: string;
    payment: {
      id: string;
      provider: string;
      amountCents: number;
      netCents: number;
      reference: string | null;
    };
    customer: {
      legalName: string;
      eik: string | null;
      vatNumber: string | null;
      addressStreet: string;
      addressCity: string;
      postalCode: string;
    };
    planName: string;
    interval: Interval;
    start: Date;
    end: Date;
    paidAt: Date;
    settings: IssueSettings;
  },
): Promise<string> {
  await lockOrganization(tx, input.supplierOrgId);
  const [owner, series, supplier] = await Promise.all([
    tx.membership.findFirst({
      where: { organizationId: input.supplierOrgId, role: 'OWNER' },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    }),
    tx.documentSeries.findFirst({
      where: { organizationId: input.supplierOrgId, isDefault: true },
      select: { id: true },
    }),
    tx.organization.findUniqueOrThrow({
      where: { id: input.supplierOrgId },
      select: { iban: true, bic: true },
    }),
  ]);
  if (!owner || !series) throw new BillingError('noSupplier');
  const card = input.payment.provider === 'REVOLUT';
  const request: IssueRequest = {
    seriesId: series.id,
    typeCode: '380',
    issueDate: isoDay(new Date()),
    // Данъчното събитие е получаването на плащането (чл. 25, ал. 7 ЗДДС) — датата му, не обработката.
    taxPointDate: isoDay(input.paidAt),
    currency: 'EUR',
    buyer: {
      name: input.customer.legalName,
      legalId: input.customer.eik ?? undefined,
      vatId: input.customer.vatNumber ?? undefined,
      address: {
        street: input.customer.addressStreet,
        city: input.customer.addressCity,
        postalCode: input.customer.postalCode,
        countryCode: 'BG',
      },
    },
    // Сметката на доставчика е реквизит и при карта (BG-09, когато е задължителна).
    payment: card
      ? { meansCode: '48', accountId: supplier.iban ?? undefined }
      : supplier.iban
        ? { meansCode: '30', accountId: supplier.iban, bic: supplier.bic ?? undefined }
        : { meansCode: '48' },
    notes: [
      card
        ? `Платено с карта на ${bgDay(input.paidAt)}.`
        : `Платено по банков път на ${bgDay(input.paidAt)}, основание ${input.payment.reference ?? ''}.`,
    ],
    precedingInvoices: [],
    allowanceCharges: [],
    vatExemptions: [],
    prepaidAmount: cents(input.payment.amountCents),
    lines: [
      {
        id: '1',
        name: `Абонамент за Фактурист — план „${input.planName}“, ${bgDay(input.start)}–${bgDay(input.end)}`,
        quantity: '1',
        unitCode: input.interval === 'YEAR' ? 'ANN' : 'MON',
        netPrice: cents(input.payment.netCents),
        vat: { category: 'S', rate: String(VAT_RATE_PERCENT) },
        allowanceCharges: [],
        attributes: [],
      },
    ],
  } as IssueRequest;
  const issued = await issueInTx(
    tx,
    { organizationId: input.supplierOrgId, role: 'OWNER', viaFirmId: null, mandateId: null },
    owner.userId,
    request,
    {},
    input.settings,
  );
  return issued.id;
}
