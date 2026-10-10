import type { ConversationType } from '@prisma/client';

/**
 * Текстовете на писмата (FR-14: на езика на човека; италиански с „Lei“). Писмото НЕ носи
 * съдържание на съобщения, имена на хора или данни от случая — само „имате ново в X“ + връзка
 * към приложението (там всичко минава през правилата за достъп). X е името на канала/групата,
 * номерът на случая или общо „директен разговор“ (името на човека е лична данна → не).
 */

export type Locale = 'it' | 'en' | 'bg';

export interface EmailPlace {
  type: ConversationType;
  name: string | null;
}

export type EmailData =
  | { kind: 'MESSAGE' | 'MENTION'; place: EmailPlace; link: string }
  | { kind: 'CASE_ASSIGNED' | 'CASE_URGENT'; caseNumber: string; link: string }
  | {
      kind: 'DIGEST';
      messages: number;
      conversations: number;
      notifications: number;
      link: string;
    };

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

interface Dict {
  direct: string;
  group: string;
  channel: (name: string) => string;
  caseDiscussion: (name: string) => string;
  message: [subject: (x: string) => string, line: (x: string) => string];
  mention: [subject: (x: string) => string, line: (x: string) => string];
  assigned: [subject: (n: string) => string, line: (n: string) => string];
  urgent: [subject: (n: string) => string, line: (n: string) => string];
  digest: [subject: string, line: (m: number, c: number, n: number) => string];
  open: string;
  footer: string;
}

const DICT: Record<Locale, Dict> = {
  it: {
    direct: 'una conversazione diretta',
    group: 'un gruppo',
    channel: (n) => `«${n}»`,
    caseDiscussion: (n) => `la discussione interna ${n}`,
    message: [(x) => `ChatChat: nuovo messaggio in ${x}`, (x) => `Ha un nuovo messaggio in ${x}.`],
    mention: [
      (x) => `ChatChat: una menzione per Lei in ${x}`,
      (x) => `È stato/a menzionato/a in ${x}.`,
    ],
    assigned: [
      (n) => `ChatChat: il caso ${n} è stato preso in carico`,
      (n) => `Il caso ${n} è stato preso in carico da un operatore.`,
    ],
    urgent: [
      (n) => `ChatChat: caso urgente ${n}`,
      (n) => `Aggiornamento urgente: il caso ${n} è stato preso in carico da un operatore.`,
    ],
    digest: [
      'ChatChat: riepilogo giornaliero',
      (m, c, n) => `Ha ${m} messaggi non letti in ${c} conversazioni e ${n} notifiche non lette.`,
    ],
    open: 'Apra ChatChat per leggere:',
    footer:
      'Riceve questa email perché le notifiche email sono attive. Può modificarle in ChatChat › Inbox › Preferenze.',
  },
  en: {
    direct: 'a direct conversation',
    group: 'a group',
    channel: (n) => `“${n}”`,
    caseDiscussion: (n) => `the internal discussion ${n}`,
    message: [(x) => `ChatChat: new message in ${x}`, (x) => `You have a new message in ${x}.`],
    mention: [(x) => `ChatChat: you were mentioned in ${x}`, (x) => `You were mentioned in ${x}.`],
    assigned: [
      (n) => `ChatChat: case ${n} has been taken over`,
      (n) => `Case ${n} has been taken over by an operator.`,
    ],
    urgent: [
      (n) => `ChatChat: urgent case ${n}`,
      (n) => `Urgent update: case ${n} has been taken over by an operator.`,
    ],
    digest: [
      'ChatChat: daily summary',
      (m, c, n) =>
        `You have ${m} unread messages in ${c} conversations and ${n} unread notifications.`,
    ],
    open: 'Open ChatChat to read:',
    footer:
      'You receive this email because email notifications are on. You can change them in ChatChat › Inbox › Preferences.',
  },
  bg: {
    direct: 'директен разговор',
    group: 'група',
    channel: (n) => `„${n}“`,
    caseDiscussion: (n) => `вътрешната дискусия ${n}`,
    message: [(x) => `ChatChat: ново съобщение в ${x}`, (x) => `Имате ново съобщение в ${x}.`],
    mention: [(x) => `ChatChat: споменаване в ${x}`, (x) => `Споменаха Ви в ${x}.`],
    assigned: [(n) => `ChatChat: случай ${n} е поет`, (n) => `Случай ${n} е поет от оператор.`],
    urgent: [
      (n) => `ChatChat: спешен случай ${n}`,
      (n) => `Спешно: случай ${n} е поет от оператор.`,
    ],
    digest: [
      'ChatChat: дневно обобщение',
      (m, c, n) => `Имате ${m} непрочетени съобщения в ${c} разговора и ${n} непрочетени известия.`,
    ],
    open: 'Отворете ChatChat, за да прочетете:',
    footer:
      'Получавате това писмо, защото имейл известията са включени. Можете да ги смените в ChatChat › Inbox › Предпочитания.',
  },
};

export const asLocale = (l: string): Locale => (l === 'en' || l === 'bg' ? l : 'it');

function placeText(d: Dict, p: EmailPlace): string {
  if (p.type === 'CASE' && p.name) return d.caseDiscussion(p.name);
  if (p.name && (p.type === 'CHANNEL' || p.type === 'GROUP')) return d.channel(p.name);
  return p.type === 'GROUP' ? d.group : d.direct;
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

export function renderEmail(locale: string, data: EmailData): EmailContent {
  const d = DICT[asLocale(locale)];
  let subject: string;
  let line: string;
  switch (data.kind) {
    case 'MESSAGE':
    case 'MENTION': {
      const [s, l] = data.kind === 'MESSAGE' ? d.message : d.mention;
      const x = placeText(d, data.place);
      subject = s(x);
      line = l(x);
      break;
    }
    case 'CASE_ASSIGNED':
    case 'CASE_URGENT': {
      const [s, l] = data.kind === 'CASE_URGENT' ? d.urgent : d.assigned;
      subject = s(data.caseNumber);
      line = l(data.caseNumber);
      break;
    }
    case 'DIGEST':
      subject = d.digest[0];
      line = d.digest[1](data.messages, data.conversations, data.notifications);
      break;
  }
  const text = `${line}\n\n${d.open} ${data.link}\n\n—\n${d.footer}\n`;
  const html =
    `<p>${escapeHtml(line)}</p>` +
    `<p>${escapeHtml(d.open)} <a href="${escapeHtml(data.link)}">${escapeHtml(data.link)}</a></p>` +
    `<hr><p style="color:#555;font-size:12px">${escapeHtml(d.footer)}</p>`;
  return { subject: subject.slice(0, 200), text, html };
}
