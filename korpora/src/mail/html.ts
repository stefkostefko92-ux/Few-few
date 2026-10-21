import type { Locale } from '../i18n.js';

/**
 * HTML вариантът на писмата — същият текст като обикновения (той остава винаги), подреден в писмо с марката:
 * логото от нашия сървър (абсолютен адрес, alt), картата с текста, основният бутон и подписът. Таблична
 * подредба и стилове в самите елементи — пощенските програми не четат външни файлове; без външни шрифтове и
 * скриптове. Светла и тъмна тема (color-scheme + @media за програмите, които я четат). На български локалните
 * форми на буквите са изключени (`locl` 0) — както на сайта.
 *
 * Текстът е от речника и от данните на човека: всичко се екранира; връзки стават само адресите на Korpora и
 * адресът за контакт.
 */

export interface HtmlMail {
  locale: Locale;
  subject: string;
  /** Поздравът и текстът — същите редове като в обикновения вариант. */
  greeting: string;
  body: string;
  /** Основното действие: адресът (той е и в текста) и надписът на бутона. */
  action: { url: string; label: string } | null;
  /** „Ако бутонът не работи, отворете този адрес:“ */
  fallback: string;
  /** Подписът — редовете от `mail.signature`. */
  signature: string;
  baseUrl: string;
  contact: string;
}

/** Цветовете на марката (public/css/base.css): светлата тема в стиловете, тъмната — в @media. */
const C = {
  paper: '#f6f7f1',
  panel: '#ffffff',
  panel2: '#eef0e8',
  rule: '#d6d7ce',
  ink: '#34302f',
  ink2: '#5d5752',
  green: '#2c6a10',
  gold: '#a87406',
} as const;

const FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Номерът на поръчката (KP-2026-000123) не се пренася на тирето. */
const plain = (text: string) =>
  escapeHtml(text).replace(/KP-\d{4}-\d+/g, '<span style="white-space:nowrap;">$&</span>');

/** Екраниран текст, в който адресите на Korpora и адресът за контакт са връзки. */
function inline(text: string, mail: HtmlMail): string {
  const pattern = new RegExp(
    // само нашият адрес — с „/“, „?“, „#“ или край след него (не korpora.example.evil.com)
    `(${escapeRe(mail.baseUrl)}(?=[/?#\\s]|$)[^\\s<>"]*)|(${escapeRe(mail.contact)})`,
    'g',
  );
  let out = '';
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    out += plain(text.slice(last, match.index));
    const [whole, url] = match;
    const href = url ? url : `mailto:${whole}`;
    out += `<a href="${escapeHtml(href)}" class="k-link" style="color:${C.green};text-decoration:underline;word-break:break-word;">${escapeHtml(whole)}</a>`;
    last = (match.index ?? 0) + whole.length;
  }
  return out + plain(text.slice(last));
}

function button(mail: HtmlMail): string {
  if (!mail.action) return '';
  const url = escapeHtml(mail.action.url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 10px;border-collapse:separate;">
<tr><td class="k-btn" bgcolor="${C.green}" style="border-radius:8px;background:${C.green};">
<a href="${url}" class="k-btn-a" style="display:inline-block;padding:14px 28px;border-radius:8px;font-family:${FONT};font-size:16px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;">${escapeHtml(mail.action.label)}</a>
</td></tr></table>
<p class="k-muted" style="margin:0 0 18px;font-size:13px;line-height:1.5;color:${C.ink2};">${escapeHtml(mail.fallback)}<br><a href="${url}" class="k-link" style="color:${C.green};text-decoration:underline;word-break:break-all;">${url}</a></p>`;
}

const P = `margin:0 0 16px;`;

/** Редовете „Ключ: стойност“ (подробностите на поръчката, на входа) — таблица с две колони. */
function keyValue(line: string): [string, string] | null {
  const match = /^([^:\n]{1,32}): (\S.*)$/.exec(line);
  return match?.[1] && match[2] ? [match[1], match[2]] : null;
}

function table(rows: Array<[string, string] | string>, mail: HtmlMail): string {
  const cells = rows
    .map((row) =>
      typeof row === 'string'
        ? `<tr><td colspan="2" class="k-rule" style="padding:8px 0;border-bottom:1px solid ${C.rule};font-weight:600;">${inline(row, mail)}</td></tr>`
        : `<tr><td class="k-rule k-muted" style="padding:8px 14px 8px 0;border-bottom:1px solid ${C.rule};color:${C.ink2};white-space:nowrap;vertical-align:top;width:1%;">${escapeHtml(row[0])}</td><td class="k-rule" style="padding:8px 0;border-bottom:1px solid ${C.rule};vertical-align:top;">${inline(row[1], mail)}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-collapse:collapse;font-size:15px;line-height:1.5;">${cells}</table>`;
}

/** Образецът за отказ и други редове с тире — в рамка, като формуляр. */
function box(lines: string[], mail: HtmlMail): string {
  const [head = '', ...rest] = lines;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-collapse:separate;"><tr><td class="k-box" style="padding:16px 18px;background:${C.panel2};border:1px dashed #b9b9ad;border-radius:8px;font-size:14px;line-height:1.55;">
<p style="margin:0 0 8px;font-weight:600;">${inline(head, mail)}</p>${rest.map((line) => `<p style="margin:0 0 4px;">${inline(line, mail)}</p>`).join('')}
</td></tr></table>`;
}

/**
 * Един абзац от текста (разделен с празен ред) → HTML. Редове с тире (образецът за отказ) — в рамка; редове
 * „ключ: стойност“ (с един заглавен ред най-много) — таблица; редът, който завършва с адреса на действието,
 * става бутон (кратко „Ключ:“ пред адреса отпада — бутонът го казва).
 */
function block(text: string, mail: HtmlMail): string {
  const lines = text.split('\n');
  if (lines.filter((line) => line.startsWith('— ')).length >= 3) return box(lines, mail);
  const url = mail.action?.url;
  const actionAt = url ? lines.findIndex((line) => line.trim().endsWith(url)) : -1;
  const pairs = lines.map(keyValue);
  const tabular =
    actionAt === -1 &&
    pairs.filter(Boolean).length >= 2 &&
    pairs.every((pair, i) => pair !== null || i === 0);
  if (tabular)
    return table(
      lines.map((line, i) => pairs[i] ?? line),
      mail,
    );
  let out = '';
  let para: string[] = [];
  const flush = () => {
    if (para.length)
      out += `<p style="${P}">${para.map((line) => inline(line, mail)).join('<br>')}</p>`;
    para = [];
  };
  lines.forEach((line, i) => {
    if (i !== actionAt || !url) {
      para.push(line);
      return;
    }
    const lead = line.trim().slice(0, -url.length).trim();
    if (lead && !pairs[i]) para.push(lead);
    flush();
    out += button(mail);
  });
  flush();
  return out;
}

/** Скритият ред за прегледа в списъка с писма: първото изречение на текста. */
function preheader(body: string): string {
  const first = body.split(/\n/)[0] ?? '';
  const sentence = (/^.*?[.!?](\s|$)/.exec(first)?.[0] ?? first).trim().slice(0, 140);
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export function renderMailHtml(mail: HtmlMail): string {
  const bg = mail.locale === 'bg';
  // решение на собственика: без българските локални форми на буквите (и в писмата)
  const locl = bg ? "font-feature-settings:'locl' 0;" : '';
  const blocks = mail.body
    .split(/\n{2,}/)
    .map((part) => block(part, mail))
    .join('');
  const sign = mail.signature
    .split('\n')
    .filter((line) => line.trim() && line.trim() !== '—')
    .map((line) => inline(line, mail))
    .join('<br>');
  return `<!doctype html>
<html lang="${mail.locale}" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(mail.subject)}</title>
<style>
:root { color-scheme: light dark; supported-color-schemes: light dark; }
html:lang(bg), html:lang(bg) body, html:lang(bg) td { font-feature-settings: 'locl' 0; }
a { color: ${C.green}; }
@media (prefers-color-scheme: dark) {
  .k-page { background: #2a2c2f !important; }
  .k-card { background: #323438 !important; border-color: #4a4c50 !important; color: #efede7 !important; }
  .k-text, .k-card p, .k-card td { color: #efede7 !important; }
  .k-muted, .k-card .k-muted { color: #c8c3bb !important; }
  .k-link { color: #b9de9c !important; }
  .k-rule { border-color: #4a4c50 !important; }
  .k-box { background: #3a3c40 !important; border-color: #5f6166 !important; }
  .k-btn { background: #9cc97b !important; }
  .k-btn-a { color: #1b2414 !important; }
  .k-accent { background: #e2b33d !important; }
}
@media (max-width: 620px) {
  .k-card { padding: 26px 20px !important; }
}
</style>
</head>
<body class="k-page" style="margin:0;padding:0;background:${C.paper};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader(mail.body))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="k-page" style="background:${C.paper};">
<tr><td align="center" style="padding:28px 12px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
<tr><td style="padding:0 4px 18px;">
<a href="${escapeHtml(mail.baseUrl)}/" style="text-decoration:none;"><img src="${escapeHtml(mail.baseUrl)}/static/img/brand/logo.png" width="170" height="56" alt="Korpora" style="display:block;width:170px;height:auto;border:0;outline:none;"></a>
</td></tr>
<tr><td class="k-accent" style="height:4px;line-height:4px;font-size:0;background:${C.gold};border-radius:12px 12px 0 0;">&nbsp;</td></tr>
<tr><td class="k-card k-text" style="background:${C.panel};border:1px solid ${C.rule};border-top:0;border-radius:0 0 12px 12px;padding:32px 36px 18px;font-family:${FONT};font-size:16px;line-height:1.6;color:${C.ink};${locl}">
<p style="${P}font-weight:600;">${inline(mail.greeting, mail)}</p>
${blocks}
</td></tr>
<tr><td class="k-muted" style="padding:20px 8px 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.ink2};${locl}">
${sign}
<br>Created and Designed by Carbon Stealth VCC
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}
