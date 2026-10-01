// The e-mails of the accounts in the person's language: plain text and its HTML twin (tables and inline styles, what
// mail clients render). Nothing typed in a form goes into them, only the links made here: a registration with someone
// else's address cannot carry a message to that person.
import { createTranslator } from 'next-intl';
import type { Locale } from '@/i18n/locales';
import it from '../../messages/it.json';
import en from '../../messages/en.json';
import bg from '../../messages/bg.json';
import { MAIL_LOGO } from './brand';
import { TOKEN_TTL_MS } from './token-shape';

export interface AccountMail {
  subject: string;
  text: string;
  html: string;
}

export type AccountMailKind =
  | { kind: 'verify'; token: string }
  | { kind: 'reset'; token: string }
  | { kind: 'exists' };

// the three files have the same keys (the parity test in present.test.ts): the Italian one types them all
const MESSAGES = { it, en, bg } as const;
const translatorFor = (locale: Locale) => createTranslator({ locale, messages: MESSAGES[locale] as typeof it, namespace: 'mail' });
type Translate = ReturnType<typeof translatorFor>;

const hours = (k: keyof typeof TOKEN_TTL_MS): number => TOKEN_TTL_MS[k] / 3600_000;

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

interface Parts {
  subject: string;
  intro: string;
  button: string;
  link: string;
  notes: readonly string[];
}

function parts(m: AccountMailKind, locale: Locale, base: string, t: Translate): Parts {
  const page = (path: string): string => `${base}/${locale}/${path}`;
  switch (m.kind) {
    case 'verify':
      return { subject: t('verifySubject'), intro: t('verifyIntro'), button: t('verifyButton'), link: `${page('verify-email')}#${m.token}`,
        notes: [t('verifyTtl', { hours: hours('VERIFY_EMAIL') }), t('verifyIgnore')] };
    case 'reset':
      return { subject: t('resetSubject'), intro: t('resetIntro'), button: t('resetButton'), link: `${page('reset-password')}#${m.token}`,
        notes: [t('resetTtl', { hours: hours('RESET_PASSWORD') }), t('resetIgnore')] };
    case 'exists':
      return { subject: t('existsSubject'), intro: t('existsIntro'), button: t('existsButton'), link: page('login'),
        notes: [t('existsForgot', { link: page('forgot-password') }), t('existsIgnore')] };
  }
}

/** One account e-mail: `base` is the public address of the site, without a trailing slash. */
export function accountMail(m: AccountMailKind, locale: Locale, base: string): AccountMail {
  const t = translatorFor(locale);
  const p = parts(m, locale, base, t);
  const text = [t('greeting'), '', p.intro, '', `${p.button}: ${p.link}`, '', ...p.notes.flatMap((n) => [n, '']), '—', t('footer')].join('\n');
  const note = (s: string): string => `<p style="margin:0 0 12px;color:#5a6480;font-size:13px">${escapeHtml(s)}</p>`;
  const html = `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(p.subject)}</title></head>
<body style="margin:0;padding:0;background:#eef1f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #d6dce6;border-radius:12px">
<tr><td style="background:#0b1426;border-radius:12px 12px 0 0;padding:20px 28px"><img src="${escapeHtml(base + MAIL_LOGO.src)}" width="${MAIL_LOGO.width}" height="${MAIL_LOGO.height}" alt="LiftPilot" style="display:block;border:0"></td></tr>
<tr><td style="padding:28px;font:15px/1.55 Arial,Helvetica,sans-serif;color:#121829">
<p style="margin:0 0 12px">${escapeHtml(t('greeting'))}</p>
<p style="margin:0 0 20px">${escapeHtml(p.intro)}</p>
<p style="margin:0 0 20px"><a href="${escapeHtml(p.link)}" style="display:inline-block;background:#1d3271;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">${escapeHtml(p.button)}</a></p>
${p.notes.map(note).join('\n')}
${note(t('linkHint'))}
<p style="margin:0;font-size:13px;word-break:break-all"><a href="${escapeHtml(p.link)}" style="color:#1d3271">${escapeHtml(p.link)}</a></p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #d6dce6;font:12px/1.5 Arial,Helvetica,sans-serif;color:#5a6480">${escapeHtml(t('footer'))}</td></tr>
</table></td></tr></table>
</body></html>`;
  return { subject: p.subject, text, html };
}
