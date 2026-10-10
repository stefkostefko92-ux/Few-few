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
import { INACTIVE_MONTHS, TERMS_VERSION, dateText, legalValues, termsDateText } from './legal';

export interface AccountMail {
  subject: string;
  text: string;
  html: string;
}

export type AccountMailKind =
  /** `terms`: the person registered the company, accepting the terms in force (their version and link in the mail);
   *  `releases`: the address has an account never confirmed nor used, which the confirmation deletes */
  | { kind: 'verify'; token: string; terms?: boolean; releases?: boolean }
  | { kind: 'reset'; token: string }
  | { kind: 'exists' }
  /** a colleague invited by a company: the link opens the invitation, which names the company (the e-mail does not) */
  | { kind: 'invite'; token: string }
  /** an invitation to an address that has an account in another company: a notice, nothing to take */
  | { kind: 'inviteExists' }
  /** to the owner: a new version of the terms, what changes, and the day it binds the company (npm run legal:notice) */
  | { kind: 'termsNotice'; binding: Date }
  /** to the owner of a company inactive without a subscription: the day it will be deleted unless someone signs in */
  | { kind: 'inactive'; deletion: Date };

// the three files have the same keys (the parity test in present.test.ts): the Italian one types them all
const MESSAGES = { it, en, bg } as const;
const translatorFor = (locale: Locale) => createTranslator({ locale, messages: MESSAGES[locale] as typeof it, namespace: 'mail' });
type Translate = ReturnType<typeof translatorFor>;

const hours = (k: keyof typeof TOKEN_TTL_MS): number => TOKEN_TTL_MS[k] / 3600_000;
const days = (k: keyof typeof TOKEN_TTL_MS): number => TOKEN_TTL_MS[k] / 86_400_000;

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
        notes: [t('verifyTtl', { hours: hours('VERIFY_EMAIL') }), ...(m.releases ? [t('verifyReleases')] : []), t('verifyIgnore'),
          ...(m.terms ? [t('verifyTerms', { version: TERMS_VERSION, date: termsDateText(locale), link: `${page('privacy')}#terms` })] : [])] };
    case 'reset':
      return { subject: t('resetSubject'), intro: t('resetIntro'), button: t('resetButton'), link: `${page('reset-password')}#${m.token}`,
        notes: [t('resetTtl', { hours: hours('RESET_PASSWORD') }), t('resetIgnore')] };
    case 'exists':
      return { subject: t('existsSubject'), intro: t('existsIntro'), button: t('existsButton'), link: page('login'),
        notes: [t('existsForgot', { link: page('forgot-password') }), t('existsIgnore')] };
    case 'invite':
      return { subject: t('inviteSubject'), intro: t('inviteIntro'), button: t('inviteButton'), link: `${page('invite')}#${m.token}`,
        notes: [t('inviteTtl', { days: days('INVITE') }), t('inviteIgnore')] };
    case 'inviteExists':
      return { subject: t('inviteExistsSubject'), intro: t('inviteExistsIntro'), button: t('existsButton'), link: page('login'),
        notes: [t('inviteExistsIgnore')] };
    case 'termsNotice': {
      const v = { ...legalValues(), date: dateText(locale, m.binding) };
      return { subject: t('termsNoticeSubject', v), intro: t('termsNoticeIntro', v), button: t('termsNoticeButton'), link: `${page('privacy')}#terms`,
        notes: [...t('termsNoticeChanges', v).split('\n'), t('termsNoticeChoice', v)] };
    }
    case 'inactive': {
      const v = { months: INACTIVE_MONTHS, date: dateText(locale, m.deletion) };
      return { subject: t('inactiveSubject', v), intro: t('inactiveIntro', v), button: t('inactiveButton'), link: page('login'),
        notes: [t('inactiveKeep', v), t('inactiveData')] };
    }
  }
}

/** One account e-mail: `base` is the public address of the site, without a trailing slash. */
export function accountMail(m: AccountMailKind, locale: Locale, base: string): AccountMail {
  const t = translatorFor(locale);
  const p = parts(m, locale, base, t), privacy = t('privacy', { link: `${base}/${locale}/privacy` });
  const text = [t('greeting'), '', p.intro, '', `${p.button}: ${p.link}`, '', ...p.notes.flatMap((n) => [n, '']), '—', t('footer'), privacy].join('\n');
  // The identity of the site, built for mail clients: the header is the site's dark desk with the light logo and the
  // cyan rule (bgcolor as well as style: clients that drop CSS backgrounds keep the attribute, so the light logo never
  // lands on white); the text sits on white with dark ink, so a client that strips or inverts colours still reads it;
  // the button is cyan with the dark ink of the site (11.8:1), the links a darker cyan that reads on white (5.8:1).
  const C = { desk: '#030a11', page: '#e9eff2', card: '#ffffff', line: '#cfdbe1', ink: '#0b1e2a', muted: '#4a5f6b', foot: '#f3f7f9',
    cyan: '#27dff0', cyanEdge: '#1bb7c8', cyanInk: '#031016', link: '#0b6f7e' } as const;
  const note = (s: string): string => `<p style="margin:0 0 12px;color:${C.muted};font-size:13px;line-height:1.55">${escapeHtml(s)}</p>`;
  const font = 'Manrope,Arial,Helvetica,sans-serif';
  const html = `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(p.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.page}" bgcolor="${C.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.page}" style="background:${C.page};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.card}" style="max-width:560px;background:${C.card};border:1px solid ${C.line};border-radius:10px">
<tr><td bgcolor="${C.desk}" style="background:${C.desk};border-radius:10px 10px 0 0;border-bottom:3px solid ${C.cyan};padding:22px 28px"><img src="${escapeHtml(base + MAIL_LOGO.src)}" width="${MAIL_LOGO.width}" height="${MAIL_LOGO.height}" alt="LiftPilot" style="display:block;border:0;color:${C.cyan};font:bold 20px ${font}"></td></tr>
<tr><td bgcolor="${C.card}" style="padding:28px;font:15px/1.6 ${font};color:${C.ink}">
<p style="margin:0 0 12px">${escapeHtml(t('greeting'))}</p>
<p style="margin:0 0 22px">${escapeHtml(p.intro)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px"><tr><td bgcolor="${C.cyan}" style="background:${C.cyan};border:1px solid ${C.cyanEdge};border-radius:6px"><a href="${escapeHtml(p.link)}" style="display:inline-block;padding:12px 22px;color:${C.cyanInk};text-decoration:none;font:bold 15px/1.2 ${font};border-radius:6px">${escapeHtml(p.button)}</a></td></tr></table>
${p.notes.map(note).join('\n')}
${note(t('linkHint'))}
<p style="margin:0;font-size:13px;word-break:break-all"><a href="${escapeHtml(p.link)}" style="color:${C.link}">${escapeHtml(p.link)}</a></p>
</td></tr>
<tr><td bgcolor="${C.foot}" style="background:${C.foot};border-radius:0 0 10px 10px;padding:16px 28px;border-top:1px solid ${C.line};font:12px/1.5 ${font};color:${C.muted}">${escapeHtml(t('footer'))}<br>${escapeHtml(privacy)}</td></tr>
</table></td></tr></table>
</body></html>`;
  return { subject: p.subject, text, html };
}
