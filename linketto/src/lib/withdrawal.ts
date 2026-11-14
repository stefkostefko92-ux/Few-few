// Функцията за отказ (чл. 11а Дир. 2011/83, изм. с Дир. (ЕС) 2023/2673 — в
// сила от 19.06.2026; ЗЗП): „Откажи се от договора тук“ → потвърждение →
// потвърждение на получаването на траен носител. Чисто, тества се. Правните
// низове са родни само bg/en (останалите → en до родния превод — никога машинен).

const DAY_MS = 24 * 60 * 60 * 1000;
export const WITHDRAWAL_DAYS = 14;

/**
 * Краят на срока: 14 дни, които започват от деня СЛЕД плащането (Регл. 1182/71)
 * и изтичат в края на 14-ия ден — по UTC (с няколко часа в полза на потребителя
 * в ЕС часовите зони).
 */
export function withdrawalDeadline(completedAt: Date): Date {
  const dayStart = Date.UTC(completedAt.getUTCFullYear(), completedAt.getUTCMonth(), completedAt.getUTCDate());
  return new Date(dayStart + (WITHDRAWAL_DAYS + 1) * DAY_MS);
}

/** Може ли потребителят да подаде изявление за отказ по тази поръчка сега. */
export function canWithdraw(order: {
  state: string;
  applied: boolean;
  completedAt: Date | null;
  withdrawalRequestedAt: Date | null;
  now: Date;
}): boolean {
  if (order.state !== 'completed' || !order.applied || !order.completedAt) return false;
  if (order.withdrawalRequestedAt) return false;
  return order.now.getTime() < withdrawalDeadline(order.completedAt).getTime();
}

const PLAN_NAMES: Record<string, string> = { PRO: 'Pro', BUSINESS: 'Business', FOUNDER: 'Founder' };

interface Strings {
  subject: string;
  intro: string;
  statement: (name: string) => string;
  contract: string;
  periods: Record<string, string>;
  orderedOn: string;
  receivedOn: string;
  next: string;
}

const STRINGS: Record<string, Strings> = {
  bg: {
    subject: 'Linketto: потвърждение за получен отказ от договора',
    intro: 'Получихме изявлението ти за отказ от договора. Това писмо е потвърждението за получаването му — запази го.',
    statement: (n) => `С настоящото ${n} уведомява, че се отказва от договора за следната услуга:`,
    contract: 'Договор',
    periods: { monthly: '1 месец', quarterly: '3 месеца', semiannual: '6 месеца', annual: '12 месеца', lifetime: 'завинаги' },
    orderedOn: 'Поръчан (платен) на',
    receivedOn: 'Изявлението е получено на',
    next: 'Връщаме цялата платена сума без неоправдано забавяне и не по-късно от 14 дни от получаването на отказа, по същия начин на плащане и без такси за теб. Отпада само платеното с тази поръчка — планът и срокът отпреди нея се възстановяват.',
  },
  en: {
    subject: 'Linketto: acknowledgement of your withdrawal from the contract',
    intro: 'We have received your statement of withdrawal from the contract. This email acknowledges its receipt — please keep it.',
    statement: (n) => `${n} hereby gives notice of withdrawal from the contract for the provision of the following service:`,
    contract: 'Contract',
    periods: { monthly: '1 month', quarterly: '3 months', semiannual: '6 months', annual: '12 months', lifetime: 'forever' },
    orderedOn: 'Ordered (paid) on',
    receivedOn: 'Statement received on',
    next: 'We refund the full amount paid without undue delay and no later than 14 days from receiving your withdrawal, using the same means of payment and at no cost to you. Only what this order bought is removed — the plan and period you had before it are restored.',
  },
};

const esc = (value: string) =>
  value.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));

/** Потвърждение на получаването на траен носител: съдържанието на изявлението + дата и час. */
export function withdrawalAckEmail(input: {
  locale: string;
  name: string;
  plan: string;
  interval: string;
  amountCents: number;
  orderRef: string;
  orderedAt: Date;
  requestedAt: Date;
}): { subject: string; html: string } {
  const lang = STRINGS[input.locale] ? input.locale : 'en';
  const s = STRINGS[lang];
  const when = (d: Date) =>
    new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(d) + ' UTC';
  const plan = PLAN_NAMES[input.plan] ?? esc(input.plan);
  const period = s.periods[input.interval] ?? esc(input.interval);
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <h1 style="font-size:20px">Linketto</h1>
  <p>${s.intro}</p>
  <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #3b82c4;background:#f8fafc">
    ${s.statement(esc(input.name))}<br>
    ${s.contract}: Linketto ${plan} · ${period} · €${(input.amountCents / 100).toFixed(2)} · ${esc(input.orderRef)}<br>
    ${s.orderedOn}: ${when(input.orderedAt)}<br>
    ${s.receivedOn}: <strong>${when(input.requestedAt)}</strong>
  </blockquote>
  <p style="font-size:14px;line-height:1.6">${s.next}</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="color:#64748b;font-size:12px">Carbon Stealth VCC · ЕИК/EIK 208725180 · info@carbonstealth.eu</p>
</div>`;
  return { subject: s.subject, html };
}
