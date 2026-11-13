/**
 * Писмото „получихте документ в шкафчето“. Чист текст + HTML с екраниране — данните идват от фактурата
 * (име на изпращача, номер, сума) и не се вярва на тях като на HTML.
 */
export interface InboxMailData {
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function inboxReceivedMail(data: InboxMailData): {
  subject: string;
  text: string;
  html: string;
} {
  const sender = data.senderEik ? `${data.senderName} (ЕИК ${data.senderEik})` : data.senderName;
  const verified = data.senderVerified
    ? 'Изпращачът е потвърдена фирма във Фактурист.'
    : 'Изпращачът още не е потвърден от Фактурист — сверете данните, преди да платите.';
  const lines = [
    `${data.documentTitle} № ${data.number} от ${data.issueDate}`,
    `Изпращач: ${sender}`,
    `Получател: ${data.recipientName}`,
    `Сума за плащане: ${data.amount}`,
    data.dueDate ? `Падеж: ${data.dueDate}` : null,
  ].filter((line): line is string => line !== null);
  const subject = `${data.documentTitle} № ${data.number} от ${data.senderName}`;
  const text = [
    'Здравейте,',
    '',
    `${data.senderName} ви изпрати документ. Той е доставен и в шкафчето на ${data.recipientName} във Фактурист.`,
    '',
    ...lines,
    '',
    verified,
    '',
    'Прикачени са PDF копие за четене и структурираният XML (UBL 2.1) за счетоводния софтуер.',
    `Отворете го в шкафчето: ${data.link}`,
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
  const html = `<!doctype html><html lang="bg"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#131722">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #cfd4dd;padding:24px">
<p style="margin:0 0 16px">${escapeHtml(data.senderName)} ви изпрати документ. Той е доставен и в шкафчето на ${escapeHtml(data.recipientName)} във Фактурист.</p>
<table style="border-collapse:collapse;font-size:14px;margin:0 0 16px">${rows}</table>
<p style="margin:0 0 16px;padding:10px 12px;background:${data.senderVerified ? '#e1f0ea' : '#fdf3e1'}">${escapeHtml(verified)}</p>
<p style="margin:0 0 16px">Прикачени са PDF копие за четене и структурираният XML (UBL 2.1) за счетоводния софтуер.</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(data.link)}" style="display:inline-block;background:#0b6b52;color:#ffffff;padding:10px 18px;text-decoration:none">Отвори в шкафчето</a></p>
<p style="margin:0;font-size:12px;color:#485064">${escapeHtml(data.signature)}</p>
</div></body></html>`;
  return { subject, text, html };
}

export interface InviteMailData {
  companyName: string;
  companyEik: string | null;
  link: string;
  expires: string;
  signature: string;
  domain: string;
}

/** Поканата да поемете профила на фирма, добавена от кантора. Връзката е единственото копие на токена. */
export function transferInviteMail(data: InviteMailData): {
  subject: string;
  text: string;
  html: string;
} {
  const company = data.companyEik
    ? `${data.companyName} (ЕИК ${data.companyEik})`
    : data.companyName;
  const intro = `${company} е добавена във Фактурист от счетоводната си кантора. Поканени сте да поемете профила ѝ като собственик: ще виждате документите, издадени от нейно име, и ще решавате кой има достъп до нея.`;
  const validity = `Връзката важи до ${data.expires} и се използва веднъж.`;
  const ignore = 'Ако не очаквате това писмо, не правете нищо — без приемане нищо не се променя.';
  const text = [
    'Здравейте,',
    '',
    intro,
    '',
    `Приемете поканата: ${data.link}`,
    validity,
    '',
    ignore,
    '',
    '—',
    data.signature,
    data.domain,
  ].join('\n');
  const html = `<!doctype html><html lang="bg"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#131722">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #cfd4dd;padding:24px">
<p style="margin:0 0 16px">${escapeHtml(intro)}</p>
<p style="margin:0 0 8px"><a href="${escapeHtml(data.link)}" style="display:inline-block;background:#0b6b52;color:#ffffff;padding:10px 18px;text-decoration:none">Приеми поканата</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#485064">${escapeHtml(validity)}</p>
<p style="margin:0 0 24px;font-size:13px;color:#485064">${escapeHtml(ignore)}</p>
<p style="margin:0;font-size:12px;color:#485064">${escapeHtml(data.signature)}</p>
</div></body></html>`;
  return { subject: `Покана: поемете профила на ${data.companyName} във Фактурист`, text, html };
}
