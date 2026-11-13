import { escapeHtml } from './templates.js';

/**
 * Писмата с връзка за профила: „Нова парола“ и „Потвърдете имейла“ — на езика на профила. Връзката е
 * единственото копие на токена (в базата е само хешът му).
 */
export type AccountMailKind = 'passwordReset' | 'verifyEmail';

export interface AccountMailData {
  locale: 'bg' | 'en';
  name: string;
  link: string;
  /** Срокът за показване: „1 час“ / „до 20.11.2026“. */
  validity: string;
  signature: string;
  domain: string;
}

const COPY = {
  bg: {
    passwordReset: {
      subject: 'Нова парола за Фактурист',
      intro: 'Поискахте нова парола за профила си във Фактурист.',
      button: 'Задай нова парола',
      ignore:
        'Ако не сте искали нова парола, не правете нищо — старата остава. Ако писмата се повтарят, сменете паролата си от „Сигурност“.',
    },
    verifyEmail: {
      subject: 'Потвърдете имейла си във Фактурист',
      intro:
        'Потвърдете, че този имейл е ваш: на него идват връзките за нова парола и известията за документите в шкафчето.',
      button: 'Потвърди имейла',
      ignore: 'Ако не сте създавали профил във Фактурист, не правете нищо.',
    },
    hello: (name: string) => `Здравейте, ${name},`,
    once: (validity: string) => `Връзката важи ${validity} и се използва веднъж.`,
  },
  en: {
    passwordReset: {
      subject: 'New password for Fakturist',
      intro: 'You asked for a new password for your Fakturist account.',
      button: 'Set a new password',
      ignore:
        'If you did not ask for a new password, do nothing — the old one stays. If these emails keep coming, change your password under “Security”.',
    },
    verifyEmail: {
      subject: 'Confirm your email address at Fakturist',
      intro:
        'Confirm that this email address is yours: password links and notices about documents in your inbox are sent to it.',
      button: 'Confirm email',
      ignore: 'If you did not create a Fakturist account, do nothing.',
    },
    hello: (name: string) => `Hello ${name},`,
    once: (validity: string) => `The link is valid ${validity} and can be used once.`,
  },
} as const;

export function accountMail(
  kind: AccountMailKind,
  data: AccountMailData,
): { subject: string; text: string; html: string } {
  const copy = COPY[data.locale];
  const words = copy[kind];
  const hello = copy.hello(data.name);
  const once = copy.once(data.validity);
  const text = [
    hello,
    '',
    words.intro,
    '',
    `${words.button}: ${data.link}`,
    once,
    '',
    words.ignore,
    '',
    '—',
    data.signature,
    data.domain,
  ].join('\n');
  const html = `<!doctype html><html lang="${data.locale}"><body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#0c1929">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d5dbe3;border-radius:8px;padding:24px">
<p style="margin:0 0 12px">${escapeHtml(hello)}</p>
<p style="margin:0 0 16px">${escapeHtml(words.intro)}</p>
<p style="margin:0 0 8px"><a href="${escapeHtml(data.link)}" style="display:inline-block;background:#03756c;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">${escapeHtml(words.button)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#4a5568">${escapeHtml(once)}</p>
<p style="margin:0 0 24px;font-size:13px;color:#4a5568">${escapeHtml(words.ignore)}</p>
<p style="margin:0;font-size:12px;color:#4a5568">${escapeHtml(data.signature)}</p>
</div></body></html>`;
  return { subject: words.subject, text, html };
}
