import type { Prisma } from '@prisma/client';
import { calculate } from '../einvoice/calculate.js';
import { InvoiceInputSchema } from '../einvoice/model.js';
import { toFixed } from '../einvoice/decimal.js';
import type { Issue } from '../einvoice/rules.js';
import { IssueRejected } from './issue-parts.js';
import type { IssueRequest } from './issue.js';

/**
 * Приспадане на аванс в окончателната фактура (казусът — Данъчника, 14.11.2026; не е правен съвет):
 * данъкът върху аванса е станал изискуем при плащането (чл. 25, ал. 7 ЗДДС), окончателната облага само
 * остатъка. По EN 16931 — ред с количество −1 и положителна цена (BR-27 забранява само отрицателна цена),
 * със същата категория и ставка като аванса; препратка BG-3 (BT-25/BT-26) към авансовата фактура.
 * BT-113 („предплатено“) не става: не намалява основата и ДДС-ът би се начислил втори път.
 *
 * Под заключването на фирмата (issueInTx): авансът е издадена фактура 386 на същата фирма, за същия
 * получател и валута, и не е приспадната в друга издадена фактура.
 */
/** Началото на текста на реда — по него шаблонът на повтаряща се фактура го познава и маха. */
export const ADVANCE_LINE_PREFIX = 'Приспадане на аванс по фактура №';

const reject = (bg: string, en: string): never => {
  const issue: Issue = {
    rule: 'BG-ADV',
    severity: 'fatal',
    path: 'advance.number',
    message: { bg, en },
  };
  throw new IssueRejected([issue]);
};

const sameParty = (a: string | null | undefined, b: string | undefined) =>
  Boolean(a && b && a.replace(/\D/g, '') === b.replace(/\D/g, ''));

function day(date: Date): string {
  const [y, m, d] = date.toISOString().slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export async function deductAdvance(
  tx: Prisma.TransactionClient,
  organizationId: string,
  request: IssueRequest,
  advanceNumber: string,
  /** „Анулирай и издай нов“: заменяната фактура още е издадена, но приспадането минава в новата. */
  replacing?: string,
): Promise<IssueRequest> {
  if (request.typeCode !== '380') {
    reject(
      'Аванс се приспада само в окончателна фактура.',
      'An advance is deducted only in a final invoice.',
    );
  }
  const number = /^\d{1,10}$/.test(advanceNumber) ? advanceNumber.padStart(10, '0') : advanceNumber;
  const advance = await tx.document.findFirst({
    where: { organizationId, number },
    select: {
      id: true,
      number: true,
      typeCode: true,
      status: true,
      issueDate: true,
      buyerEik: true,
      input: true,
    },
  });
  if (!advance || advance.typeCode !== '386' || advance.status !== 'ISSUED') {
    reject(
      'Няма издадена авансова фактура с този номер.',
      'There is no issued prepayment invoice with this number.',
    );
  }
  const found = advance!;
  const buyer = request.buyer;
  if (!sameParty(found.buyerEik, buyer.legalId) && !sameParty(found.buyerEik, buyer.vatId)) {
    reject(
      'Авансовата фактура е за друг получател.',
      'The prepayment invoice is for a different buyer.',
    );
  }
  const used = await tx.document.count({
    where: {
      organizationId,
      precedingId: found.id,
      typeCode: '380',
      status: 'ISSUED',
      ...(replacing ? { id: { not: replacing } } : {}),
    },
  });
  if (used > 0) {
    reject(
      'Този аванс вече е приспаднат в друга фактура.',
      'This advance is already deducted in another invoice.',
    );
  }
  const input = InvoiceInputSchema.parse(found.input);
  if (input.currency !== request.currency) {
    reject(
      'Авансовата фактура е в друга валута.',
      'The prepayment invoice is in a different currency.',
    );
  }
  const name = `${ADVANCE_LINE_PREFIX} ${found.number} от ${day(found.issueDate)}`;
  const deductions = calculate(input).breakdown.map((group, i) => ({
    id: String(request.lines.length + i + 1),
    name,
    quantity: '-1',
    unitCode: 'C62',
    netPrice: toFixed(group.taxable, 2),
    vat: group.rate
      ? { category: group.category, rate: toFixed(group.rate, 2) }
      : { category: group.category },
    allowanceCharges: [],
    attributes: [],
  }));
  // Основанието за нулева ставка или освобождаване на аванса трябва да е и в окончателната (BR-*-10).
  const exemptions = [
    ...request.vatExemptions,
    ...input.vatExemptions.filter(
      (e) => !request.vatExemptions.some((own) => own.category === e.category),
    ),
  ];
  const reference = {
    number: found.number!,
    issueDate: found.issueDate.toISOString().slice(0, 10),
  };
  return {
    ...request,
    lines: [...request.lines, ...deductions],
    vatExemptions: exemptions,
    precedingInvoices: [
      reference,
      ...request.precedingInvoices.filter((p) => p.number !== found.number),
    ],
  };
}
