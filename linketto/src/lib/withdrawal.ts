// Функцията за отказ (чл. 11а Дир. 2011/83, изм. с Дир. (ЕС) 2023/2673 — в
// сила от 19.06.2026; ЗЗП): „Откажете се от договора тук“ → потвърждение →
// потвърждение на получаването на траен носител. Чисто, тества се. Правните
// низове са родни bg/en/it/es/de/fr (останалите → en до родния превод — никога машинен).

const DAY_MS = 24 * 60 * 60 * 1000;
export const WITHDRAWAL_DAYS = 14;

const HOUR_MS = 60 * 60 * 1000;
// Потребителите в ЕС са между UTC−1 (Азорските о-ви) и UTC+3 (лятно EEST).
const EASTMOST_OFFSET_MS = 3 * HOUR_MS;
const WESTMOST_OFFSET_MS = 1 * HOUR_MS;

/**
 * Последният ден на срока (UTC полунощ на календарната дата): 14 дни, които
 * започват от деня СЛЕД плащането (Регл. 1182/71). Денят на плащането се взима
 * в най-източната зона на ЕС — така никой потребител не губи ден.
 */
export function withdrawalLastDay(completedAt: Date): Date {
  const east = new Date(completedAt.getTime() + EASTMOST_OFFSET_MS);
  const dayStart = Date.UTC(east.getUTCFullYear(), east.getUTCMonth(), east.getUTCDate());
  return new Date(dayStart + WITHDRAWAL_DAYS * DAY_MS);
}

/** Бутонът е отворен до 24:00 на последния ден в най-западната зона на ЕС. */
export function withdrawalDeadline(completedAt: Date): Date {
  return new Date(withdrawalLastDay(completedAt).getTime() + DAY_MS + WESTMOST_OFFSET_MS);
}

/** Може ли потребителят да подаде изявление за отказ по тази поръчка сега. */
export function canWithdraw(order: {
  state: string;
  applied: boolean;
  completedAt: Date | null;
  withdrawalRequestedAt: Date | null;
  now: Date;
}): boolean {
  // Платена поръчка е договор — приложена (completed) или неприложена (conflict).
  const paidContract = (order.state === 'completed' && order.applied) || order.state === 'conflict';
  if (!paidContract || !order.completedAt) return false;
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
  it: {
    subject: 'Linketto: conferma di ricevimento del recesso dal contratto',
    intro: 'Abbiamo ricevuto la tua dichiarazione di recesso dal contratto. Questa email è la conferma del suo ricevimento — conservala.',
    statement: (n) => `Con la presente ${n} notifica il recesso dal contratto per la prestazione del seguente servizio:`,
    contract: 'Contratto',
    periods: { monthly: '1 mese', quarterly: '3 mesi', semiannual: '6 mesi', annual: '12 mesi', lifetime: 'per sempre' },
    orderedOn: 'Ordinato (pagato) il',
    receivedOn: 'Dichiarazione ricevuta il',
    next: 'Ti rimborsiamo l’intero importo pagato senza indebito ritardo e comunque entro 14 giorni dal ricevimento del recesso, con lo stesso mezzo di pagamento e senza costi per te. Viene meno solo ciò che è stato acquistato con questo ordine — il piano e il periodo che avevi prima vengono ripristinati.',
  },
  es: {
    subject: 'Linketto: acuse de recibo de tu desistimiento del contrato',
    intro: 'Hemos recibido tu declaración de desistimiento del contrato. Este email es el acuse de recibo; guárdalo.',
    statement: (n) => `Por la presente, ${n} comunica que desiste del contrato de prestación del siguiente servicio:`,
    contract: 'Contrato',
    periods: { monthly: '1 mes', quarterly: '3 meses', semiannual: '6 meses', annual: '12 meses', lifetime: 'para siempre' },
    orderedOn: 'Pedido (pagado) el',
    receivedOn: 'Declaración recibida el',
    next: 'Te devolvemos el importe íntegro pagado sin demoras indebidas y, a más tardar, 14 días después de recibir tu desistimiento, por el mismo medio de pago y sin ningún coste para ti. Solo se retira lo adquirido con este pedido: se restablecen el plan y el período que tenías antes.',
  },
  de: {
    subject: 'Linketto: Eingangsbestätigung deines Widerrufs',
    intro: 'Wir haben deine Widerrufserklärung erhalten. Diese E-Mail bestätigt ihren Eingang — bitte bewahre sie auf.',
    statement: (n) => `Hiermit widerruft ${n} den Vertrag über die Erbringung der folgenden Dienstleistung:`,
    contract: 'Vertrag',
    periods: { monthly: '1 Monat', quarterly: '3 Monate', semiannual: '6 Monate', annual: '12 Monate', lifetime: 'für immer' },
    orderedOn: 'Bestellt (bezahlt) am',
    receivedOn: 'Erklärung eingegangen am',
    next: 'Wir erstatten dir den vollen gezahlten Betrag unverzüglich und spätestens binnen 14 Tagen ab Eingang deines Widerrufs, über dasselbe Zahlungsmittel und ohne Kosten für dich. Es entfällt nur, was mit dieser Bestellung bezahlt wurde — Plan und Zeitraum von davor werden wiederhergestellt.',
  },
  fr: {
    subject: 'Linketto : accusé de réception de votre rétractation',
    intro: 'Nous avons bien reçu votre déclaration de rétractation du contrat. Cet e-mail en accuse réception — conservez-le.',
    statement: (n) => `Par la présente, ${n} notifie sa rétractation du contrat portant sur la prestation du service ci-dessous :`,
    contract: 'Contrat',
    periods: { monthly: '1 mois', quarterly: '3 mois', semiannual: '6 mois', annual: '12 mois', lifetime: 'pour toujours' },
    orderedOn: 'Commandé (payé) le',
    receivedOn: 'Déclaration reçue le',
    next: 'Nous vous remboursons l’intégralité du montant payé sans retard excessif et au plus tard 14 jours après réception de votre rétractation, par le même moyen de paiement et sans frais pour vous. Seul ce qui a été acheté avec cette commande est retiré — le plan et la période dont vous disposiez auparavant sont rétablis.',
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
