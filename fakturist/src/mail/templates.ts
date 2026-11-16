import type { Locale } from '../i18n.js';

/**
 * Писмото „получихте документ в шкафчето“. Чист текст + HTML с екраниране — данните идват от фактурата
 * (име на изпращача, номер, сума) и не се вярва на тях като на HTML. Езикът (`locale`, по подразбиране
 * български) е на профила на получателя — src/mail/locale.ts; документът си остава на езика, на който е.
 */
export interface InboxMailData {
  locale?: Locale;
  senderName: string;
  senderEik: string | null;
  senderVerified: boolean;
  recipientName: string;
  documentTitle: string;
  number: string;
  issueDate: string;
  dueDate: string | null;
  amount: string;
  link: string;
  signature: string;
  domain: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const INBOX = {
  bg: {
    hello: 'Здравейте,',
    eik: 'ЕИК',
    verified: 'Изпращачът е потвърдена фирма във Фактурист.',
    unverified: 'Изпращачът още не е потвърден от Фактурист — сверете данните, преди да платите.',
    heading: (title: string, number: string, date: string) => `${title} № ${number} от ${date}`,
    sender: 'Изпращач',
    recipient: 'Получател',
    amount: 'Сума за плащане',
    due: 'Падеж',
    subject: (title: string, number: string, sender: string) => `${title} № ${number} от ${sender}`,
    intro: (sender: string, recipient: string) =>
      `${sender} ви изпрати документ. Той е доставен и в шкафчето на ${recipient} във Фактурист.`,
    files:
      'Прикачени са PDF копие за четене и структурираният XML (UBL 2.1) за счетоводния софтуер.',
    open: 'Отворете го в шкафчето',
    button: 'Отвори в шкафчето',
  },
  en: {
    hello: 'Hello,',
    eik: 'EIK',
    verified: 'The sender is a verified company in Fakturist.',
    unverified: 'The sender is not yet verified by Fakturist — check the details before you pay.',
    heading: (title: string, number: string, date: string) => `${title} No. ${number} of ${date}`,
    sender: 'Sender',
    recipient: 'Recipient',
    amount: 'Amount due',
    due: 'Due date',
    subject: (title: string, number: string, sender: string) =>
      `${title} No. ${number} from ${sender}`,
    intro: (sender: string, recipient: string) =>
      `${sender} sent you a document. It is also delivered to the inbox of ${recipient} in Fakturist.`,
    files:
      'Attached are a PDF copy for reading and the structured XML (UBL 2.1) for accounting software.',
    open: 'Open it in the inbox',
    button: 'Open in the inbox',
  },
} as const;

export function inboxReceivedMail(data: InboxMailData): {
  subject: string;
  text: string;
  html: string;
} {
  const locale = data.locale ?? 'bg';
  const c = INBOX[locale];
  const sender = data.senderEik
    ? `${data.senderName} (${c.eik} ${data.senderEik})`
    : data.senderName;
  const verified = data.senderVerified ? c.verified : c.unverified;
  const lines = [
    c.heading(data.documentTitle, data.number, data.issueDate),
    `${c.sender}: ${sender}`,
    `${c.recipient}: ${data.recipientName}`,
    `${c.amount}: ${data.amount}`,
    data.dueDate ? `${c.due}: ${data.dueDate}` : null,
  ].filter((line): line is string => line !== null);
  const subject = c.subject(data.documentTitle, data.number, data.senderName);
  const intro = c.intro(data.senderName, data.recipientName);
  const text = [
    c.hello,
    '',
    intro,
    '',
    ...lines,
    '',
    verified,
    '',
    c.files,
    `${c.open}: ${data.link}`,
    '',
    '—',
    data.signature,
    data.domain,
  ].join('\n');
  const rows = lines
    .map((line) => {
      const [label, ...rest] = line.split(': ');
      return rest.length
        ? `<tr><td style="padding:4px 12px 4px 0;color:#485064">${escapeHtml(label ?? '')}</td><td style="padding:4px 0"><strong>${escapeHtml(rest.join(': '))}</strong></td></tr>`
        : `<tr><td colspan="2" style="padding:4px 0 8px;font-size:17px"><strong>${escapeHtml(line)}</strong></td></tr>`;
    })
    .join('');
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#131722">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #cfd4dd;padding:24px">
<p style="margin:0 0 16px">${escapeHtml(intro)}</p>
<table style="border-collapse:collapse;font-size:14px;margin:0 0 16px">${rows}</table>
<p style="margin:0 0 16px;padding:10px 12px;background:${data.senderVerified ? '#e1f0ea' : '#fdf3e1'}">${escapeHtml(verified)}</p>
<p style="margin:0 0 16px">${escapeHtml(c.files)}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(data.link)}" style="display:inline-block;background:#03756c;color:#ffffff;padding:10px 18px;text-decoration:none">${escapeHtml(c.button)}</a></p>
<p style="margin:0;font-size:12px;color:#485064">${escapeHtml(data.signature)}</p>
</div></body></html>`;
  return { subject, text, html };
}

/** Писмото до мастъра: собственик, поканен от кантора — за проверка. Без имейла на собственика. */
export function ownershipReviewMail(data: {
  locale?: Locale;
  companyName: string;
  companyEik: string | null;
  firmName: string;
  link: string;
}): { subject: string; text: string; html: string } {
  const bg = (data.locale ?? 'bg') === 'bg';
  const company = data.companyEik
    ? `${data.companyName} (${bg ? 'ЕИК' : 'EIK'} ${data.companyEik})`
    : data.companyName;
  const lines = bg
    ? [
        `${company} има нов собственик във Фактурист — по покана от кантора ${data.firmName}.`,
        'Проверете, че собственикът наистина представлява фирмата. Ако не — „Отнеми собствеността“ и поканете истинския собственик с „Прехвърли“.',
      ]
    : [
        `${company} has a new owner in Fakturist — invited by the accounting firm ${data.firmName}.`,
        'Check that the owner really represents the company. If not — “Revoke ownership” and invite the real owner with “Transfer”.',
      ];
  const label = bg ? 'Фирмата в мастър панела' : 'The company in the master panel';
  const button = bg ? 'Отвори в мастър панела' : 'Open in the master panel';
  const text = [...lines, '', `${label}: ${data.link}`].join('\n');
  const html = `<!doctype html><html lang="${bg ? 'bg' : 'en'}"><body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#131722">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #cfd4dd;padding:24px">
${lines.map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`).join('')}
<p style="margin:0"><a href="${escapeHtml(data.link)}" style="display:inline-block;background:#03756c;color:#ffffff;padding:10px 18px;text-decoration:none">${escapeHtml(button)}</a></p>
</div></body></html>`;
  const subject = bg
    ? `За проверка: нов собственик на ${data.companyName}`
    : `To check: new owner of ${data.companyName}`;
  return { subject, text, html };
}

export interface InviteMailData {
  locale?: Locale;
  companyName: string;
  companyEik: string | null;
  /** Кантората, която кани (по пълномощно); null — поканата е от Фактурист. */
  firmName?: string | null;
  /** Предаване от собственика (SPEC 84): името му — писмото казва, че той предава собствеността. */
  fromName?: string | null;
  link: string;
  expires: string;
  signature: string;
  domain: string;
}

const INVITE = {
  bg: {
    hello: 'Здравейте,',
    eik: 'ЕИК',
    by: (firm: string | null | undefined) =>
      firm ? `счетоводната кантора ${firm}` : 'счетоводната си кантора',
    mandate: (firm: string) =>
      ` При приемането можете да потвърдите и пълномощното на ${firm} — тя ще издава документи от името на фирмата, но собствеността и достъпът остават ваши.`,
    intro: (company: string, by: string, mandate: string) =>
      `${company} е добавена във Фактурист от ${by}. Поканени сте да поемете профила ѝ като собственик: ще виждате документите, издадени от нейно име, и ще решавате кой има достъп до нея.${mandate}`,
    validity: (date: string) => `Връзката важи до ${date} и се използва веднъж.`,
    ignore: 'Ако не очаквате това писмо, не правете нищо — без приемане нищо не се променя.',
    accept: 'Приемете поканата',
    button: 'Приеми поканата',
    subject: (company: string) => `Покана: поемете профила на ${company} във Фактурист`,
    handover: (from: string, company: string) =>
      `${from} Ви предава собствеността на ${company} във Фактурист. Като собственик ще виждате документите на фирмата, ще решавате кой има достъп до нея и ще управлявате плана. ${from} остава администратор, докато не решите друго.`,
    handoverSubject: (company: string) => `Предаване на собственост: ${company} във Фактурист`,
  },
  en: {
    hello: 'Hello,',
    eik: 'EIK',
    by: (firm: string | null | undefined) =>
      firm ? `the accounting firm ${firm}` : 'your accounting firm',
    mandate: (firm: string) =>
      ` When accepting, you can also confirm the authorisation of ${firm} — it will issue documents on the company’s behalf, while the ownership and the access stay yours.`,
    intro: (company: string, by: string, mandate: string) =>
      `${company} was added to Fakturist by ${by}. You are invited to take over its account as the owner: you will see the documents issued on its behalf and decide who has access to it.${mandate}`,
    validity: (date: string) => `The link is valid until ${date} and can be used once.`,
    ignore: 'If you do not expect this email, do nothing — nothing changes without accepting it.',
    accept: 'Accept the invitation',
    button: 'Accept the invitation',
    subject: (company: string) => `Invitation: take over the account of ${company} in Fakturist`,
    handover: (from: string, company: string) =>
      `${from} is handing over the ownership of ${company} in Fakturist to you. As the owner you will see the company’s documents, decide who has access to it and manage the plan. ${from} stays an administrator until you decide otherwise.`,
    handoverSubject: (company: string) => `Ownership handover: ${company} in Fakturist`,
  },
} as const;

/** Поканата да поемете профила на фирма, добавена от кантора. Връзката е единственото копие на токена. */
export function transferInviteMail(data: InviteMailData): {
  subject: string;
  text: string;
  html: string;
} {
  const locale = data.locale ?? 'bg';
  const c = INVITE[locale];
  const company = data.companyEik
    ? `${data.companyName} (${c.eik} ${data.companyEik})`
    : data.companyName;
  const intro = data.fromName
    ? c.handover(data.fromName, company)
    : c.intro(company, c.by(data.firmName), data.firmName ? c.mandate(data.firmName) : '');
  const validity = c.validity(data.expires);
  const text = [
    c.hello,
    '',
    intro,
    '',
    `${c.accept}: ${data.link}`,
    validity,
    '',
    c.ignore,
    '',
    '—',
    data.signature,
    data.domain,
  ].join('\n');
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#131722">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #cfd4dd;padding:24px">
<p style="margin:0 0 16px">${escapeHtml(intro)}</p>
<p style="margin:0 0 8px"><a href="${escapeHtml(data.link)}" style="display:inline-block;background:#03756c;color:#ffffff;padding:10px 18px;text-decoration:none">${escapeHtml(c.button)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#485064">${escapeHtml(validity)}</p>
<p style="margin:0 0 24px;font-size:13px;color:#485064">${escapeHtml(c.ignore)}</p>
<p style="margin:0;font-size:12px;color:#485064">${escapeHtml(data.signature)}</p>
</div></body></html>`;
  const subject = data.fromName ? c.handoverSubject(data.companyName) : c.subject(data.companyName);
  return { subject, text, html };
}
