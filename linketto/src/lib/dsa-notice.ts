// Изложение на мотивите при спиране на профил — чл. 17 Регл. (ЕС) 2022/2065
// (DSA). Праща се на собственика при всеки бан: решението и обхватът му,
// фактите (вкл. дали е по сигнал), че не е ползвано автоматизирано решение,
// основанието в Общите условия/закона и пътищата за обжалване. Чисто, тества се.
// Правни низове — родни bg/en (останалите → en до родния превод).

// Само основания, които ОУ („Съдържание и модерация“) реално забраняват.
export const BAN_CATEGORIES = ['impersonation', 'phishing', 'illegal', 'spam', 'other'] as const;
export type BanCategory = (typeof BAN_CATEGORIES)[number];

export function isBanCategory(value: string): value is BanCategory {
  return (BAN_CATEGORIES as readonly string[]).includes(value);
}

interface Strings {
  subject: (slug: string) => string;
  decision: (slug: string, date: string) => string;
  categories: Record<BanCategory, string>;
  categoryLabel: string;
  facts: string;
  source: (fromReport: boolean) => string;
  automated: string;
  ground: string;
  redressTitle: string;
  redress: string[];
}

const STRINGS: Record<string, Strings> = {
  bg: {
    subject: (s) => `Linketto: профилът /u/${s} е спрян — мотиви`,
    decision: (s, d) =>
      `На ${d} спряхме профила /u/${s}: той не се показва публично (вкл. на собствен домейн и кратки линкове), докато решението не бъде преразгледано. Акаунтът и данните ти остават — можеш да влизаш и да изтеглиш съдържанието си.`,
    categories: {
      impersonation: 'представяне за друго лице или марка',
      phishing: 'фишинг или измамни линкове',
      illegal: 'незаконно съдържание',
      spam: 'спам или подвеждащи линкове',
      other: 'друго нарушение на Общите условия',
    },
    categoryLabel: 'Вид нарушение',
    facts: 'Факти и обстоятелства',
    source: (r) => (r ? 'Решението е взето след сигнал от трето лице (чл. 16 DSA).' : 'Решението е взето по наша собствена инициатива.'),
    automated: 'Не са ползвани автоматизирани средства — решението е взето и прегледано от човек.',
    ground:
      'Основание: Общите условия на Linketto, раздел „Съдържание и модерация“ (забрана на незаконно съдържание, представяне за друг, фишинг, злонамерени и подвеждащи линкове); при незаконно съдържание — и съответният закон, посочен в обосновката по-горе.',
    redressTitle: 'Как да обжалваш',
    redress: [
      'Отговори на info@carbonstealth.eu с твоите доводи — разглеждаме обжалването безплатно, от човек, без неоправдано забавяне.',
      'Можеш да подадеш жалба до Координатора за цифрови услуги в твоята държава.',
      'Можеш да потърсиш защита и пред компетентния съд.',
    ],
  },
  en: {
    subject: (s) => `Linketto: profile /u/${s} has been suspended — statement of reasons`,
    decision: (s, d) =>
      `On ${d} we suspended the profile /u/${s}: it is not shown publicly (including on a custom domain and short links) until the decision is reviewed. Your account and data remain — you can sign in and download your content.`,
    categories: {
      impersonation: 'impersonation of another person or brand',
      phishing: 'phishing or fraudulent links',
      illegal: 'illegal content',
      spam: 'spam or misleading links',
      other: 'another breach of the Terms of Service',
    },
    categoryLabel: 'Type of breach',
    facts: 'Facts and circumstances',
    source: (r) => (r ? 'The decision was taken following a notice from a third party (Art. 16 DSA).' : 'The decision was taken on our own initiative.'),
    automated: 'No automated means were used — the decision was taken and reviewed by a human.',
    ground:
      'Ground: the Linketto Terms of Service, section “Content and moderation” (prohibition of illegal content, impersonation, phishing, malicious and misleading links); for illegal content, also the law referred to in the explanation above.',
    redressTitle: 'How to appeal',
    redress: [
      'Reply to info@carbonstealth.eu with your arguments — we handle appeals free of charge, by a human, without undue delay.',
      'You can lodge a complaint with the Digital Services Coordinator in your country.',
      'You can also seek redress before the competent court.',
    ],
  },
};

const esc = (value: string) =>
  value.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));

export function banNoticeEmail(input: {
  locale: string;
  slug: string;
  category: BanCategory;
  reason: string;
  decidedAt: Date;
  fromReport: boolean;
}): { subject: string; html: string } {
  const lang = STRINGS[input.locale] ? input.locale : 'en';
  const s = STRINGS[lang];
  const slug = esc(input.slug);
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(input.decidedAt);
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <h1 style="font-size:20px">Linketto</h1>
  <p>${s.decision(slug, date)}</p>
  <p><strong>${s.categoryLabel}:</strong> ${s.categories[input.category]}</p>
  <p><strong>${s.facts}:</strong><br>${esc(input.reason).replace(/\n/g, '<br>')}</p>
  <p>${s.source(input.fromReport)}</p>
  <p>${s.automated}</p>
  <p style="font-size:14px">${s.ground}</p>
  <h2 style="font-size:16px;margin-top:24px">${s.redressTitle}</h2>
  <ul style="line-height:1.6">${s.redress.map((r) => `<li>${r}</li>`).join('')}</ul>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="color:#64748b;font-size:12px">Carbon Stealth VCC · ЕИК/EIK 208725180 · info@carbonstealth.eu</p>
</div>`;
  return { subject: s.subject(input.slug), html };
}
