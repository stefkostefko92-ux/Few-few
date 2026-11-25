import { dec, divRound, fromCents, toCents } from '../../einvoice/decimal.js';
import type { SaftBalance } from './model.js';

/**
 * Салдото на клиента по сметката за вземания — само от данните във Фактурист: отворените суми за
 * плащане (BT-115) минус записаните плащания, към деня. Сумите в чужда валута — в евро по курса на
 * документа (половин цент нагоре). Счетоводната програма има последната дума: тя знае и плащанията,
 * които не са въведени тук.
 *
 * - Фактура (380) и дебитно известие (383) увеличават вземането, кредитно известие (381) го намалява.
 * - Авансова фактура (386) не влиза: плащане по нея не се записва във Фактурист (`PAYABLE_TYPES`), а
 *   окончателната фактура я приспада и носи само остатъка — иначе авансът остава фантомно вземане.
 *   Кредитно известие към авансова — по същата причина също не влиза.
 * - Анулираният документ е в сила от деня на издаване до деня на анулирането (софийско време): салдо за
 *   минал месец не се мени, когато документът се анулира по-късно. Плащанията, преместени на заменящия
 *   документ, остават с деня си (`paidOn`) — така сборът към всеки ден е като тогава.
 */
export interface BalanceDocument {
  id: string;
  customerId: string;
  typeCode: string;
  /** Видът на документа, към който е известието (BG-3 → `precedingId`), ако има. */
  precedingTypeCode: string | null;
  issueDate: string;
  /** Денят на анулирането (ГГГГ-ММ-ДД, София); null — в сила. */
  cancelledOn: string | null;
  payableCents: bigint;
  currency: string;
  eurExchangeRate: string | undefined;
}

export interface BalancePayment {
  documentId: string;
  paidOn: string;
  amountCents: bigint;
}

/** +1 — увеличава вземането, −1 — намалява го, 0 — не влиза в салдото. */
export function balanceSign(
  doc: Pick<BalanceDocument, 'typeCode' | 'precedingTypeCode'>,
): -1 | 0 | 1 {
  if (doc.typeCode === '380' || doc.typeCode === '383') return 1;
  if (doc.typeCode === '381') return doc.precedingTypeCode === '386' ? 0 : -1;
  return 0;
}

function eurCents(cents: bigint, currency: string, rate: string | undefined): bigint {
  if (currency === 'EUR' || !rate) return cents;
  return toCents(divRound(fromCents(cents), dec(rate), 2));
}

/** Салдата към деня преди `from` (начално) и към `to` включително (крайно), ГГГГ-ММ-ДД. */
export function customerBalances(
  documents: readonly BalanceDocument[],
  payments: readonly BalancePayment[],
  from: string,
  to: string,
): Map<string, SaftBalance> {
  const out = new Map<string, SaftBalance>();
  const byId = new Map(documents.map((d) => [d.id, d]));
  const move = (customerId: string, day: string, cents: bigint) => {
    if (day > to) return;
    const balance = out.get(customerId) ?? { openingCents: 0n, closingCents: 0n };
    if (day < from) balance.openingCents += cents;
    balance.closingCents += cents;
    out.set(customerId, balance);
  };
  for (const doc of documents) {
    const sign = balanceSign(doc);
    if (sign === 0) continue;
    const amount = BigInt(sign) * eurCents(doc.payableCents, doc.currency, doc.eurExchangeRate);
    move(doc.customerId, doc.issueDate, amount);
    if (doc.cancelledOn) move(doc.customerId, doc.cancelledOn, -amount);
  }
  for (const payment of payments) {
    const doc = byId.get(payment.documentId);
    if (!doc) continue;
    move(
      doc.customerId,
      payment.paidOn,
      -eurCents(payment.amountCents, doc.currency, doc.eurExchangeRate),
    );
  }
  return out;
}
