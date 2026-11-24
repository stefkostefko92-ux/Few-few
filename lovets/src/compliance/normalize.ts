import { domainToASCII } from 'node:url';
import type { EmailKind, Market, PhoneKind } from './types.js';

/** Невидими и форматиращи знаци (нулева ширина, посока на текста…) — вход с тях се отказва. */
const INVISIBLE_RE = /[\p{Cf}\p{Cc}]/u;
const LOCAL_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const ASCII_DOMAIN_RE =
  /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/** Домейн в канонична форма: малки букви, без точка в края, IDN → punycode. Невалиден → null. */
export function canonicalDomain(raw: string): string | null {
  const v = raw.trim().toLowerCase().replace(/\.$/, '');
  if (!v || INVISIBLE_RE.test(v)) return null;
  const ascii = domainToASCII(v);
  return ascii && ASCII_DOMAIN_RE.test(ascii) ? ascii : null;
}

/**
 * Имейл в канонична форма: локалната част само ASCII (без интервали, „;“, „,“, кавички), домейнът в
 * punycode. Невалиден → null.
 */
export function normalizeEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (INVISIBLE_RE.test(v)) return null;
  const at = v.lastIndexOf('@');
  if (at < 1) return null;
  const local = v.slice(0, at);
  const domain = canonicalDomain(v.slice(at + 1));
  return domain && local.length <= 64 && LOCAL_RE.test(local) ? `${local}@${domain}` : null;
}

/** Адресът без „+таг“ (ivan+promo@ → ivan@) — за ключовете на регистрите и „не ме търсете“. */
export function untaggedEmail(email: string): string {
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at).split('+')[0] ?? '';
  return `${local}@${email.slice(at + 1)}`;
}

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1);
}

/** Пощенски услуги за физически лица. Адрес там не е фирмен, а личен (ЗЕТ чл. 6, ал. 4). */
const PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.it',
  'ymail.com',
  'hotmail.com',
  'hotmail.it',
  'outlook.com',
  'outlook.it',
  'live.com',
  'live.it',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'gmx.com',
  'gmx.net',
  'proton.me',
  'protonmail.com',
  'abv.bg',
  'mail.bg',
  'dir.bg',
  'gbg.bg',
  'yahoo.bg',
  'libero.it',
  'virgilio.it',
  'tiscali.it',
  'alice.it',
  'tim.it',
  'tin.it',
  'email.it',
  'fastwebnet.it',
  'inwind.it',
  'iol.it',
]);

/** Общи фирмени кутии (не назовават човек). */
const GENERIC_LOCAL_PARTS = new Set([
  'info',
  'office',
  'contact',
  'contacts',
  'kontakt',
  'kontakti',
  'contatti',
  'contatto',
  'hello',
  'mail',
  'sales',
  'sale',
  'commerciale',
  'vendite',
  'amministrazione',
  'segreteria',
  'ufficio',
  'admin',
  'support',
  'assistenza',
  'service',
  'servizi',
  'orders',
  'ordini',
  'booking',
  'prenotazioni',
  'reception',
  'direzione',
  'marketing',
  'tehnicheski',
  'tecnico',
  'firma',
  'company',
]);

export function classifyEmail(email: string): EmailKind {
  if (PERSONAL_DOMAINS.has(emailDomain(email))) return 'personal';
  const local = email.slice(0, email.lastIndexOf('@'));
  return GENERIC_LOCAL_PARTS.has(local) ? 'generic' : 'named';
}

const E164_RE = /^\+\d{8,15}$/;

/**
 * Към E.164. Национален формат се тълкува по пазара на записа: БГ „0…“ → +359 без нулата;
 * ИТ номерата пазят водещата 0 на стационарните (+39 0…), мобилните започват с 3.
 */
export function normalizePhone(raw: string, market: Market): string | null {
  if (INVISIBLE_RE.test(raw)) return null;
  // „/“ не е разделител: „06 1234567/8“ са два номера, не един.
  let v = raw.trim().replace(/[\s().\-]/g, '');
  if (v.startsWith('00')) v = `+${v.slice(2)}`;
  if (!v.startsWith('+')) {
    if (!/^\d+$/.test(v)) return null;
    if (market === 'BG') {
      if (!v.startsWith('0')) return null;
      v = `+359${v.slice(1)}`;
    } else {
      if (!/^[03]/.test(v)) return null;
      v = `+39${v}`;
    }
  }
  if (!E164_RE.test(v)) return null;
  // Дължини по националните планове: ИТ мобилни 3 + 8–9 цифри, стационарни 0 + 5–10; БГ 7–9 цифри.
  if (v.startsWith('+39') && !/^(3\d{8,9}|0\d{5,10})$/.test(v.slice(3))) return null;
  if (v.startsWith('+359') && !/^\d{7,9}$/.test(v.slice(4))) return null;
  return v;
}

export function marketOfPhone(e164: string): Market | null {
  if (e164.startsWith('+359')) return 'BG';
  if (e164.startsWith('+39')) return 'IT';
  return null;
}

/**
 * Неясното се третира като мобилен (по-строгото). БГ: мобилни 87/88/89/98/99, стационарни —
 * кодовете на населените места (2, 3x–7x без 70x, 81–86, 91–97); 70x (национални услуги) е неясен.
 * ИТ: мобилни 3xx, стационарни 0xx.
 */
export function phoneKind(e164: string): PhoneKind {
  if (e164.startsWith('+359')) {
    const n = e164.slice(4);
    if (/^(8[7-9]|9[89])\d{7}$/.test(n)) return 'mobile';
    if (n.startsWith('430')) return 'unknown'; // TETRA — не е сигурно стационарен
    if (/^(2\d{6,7}|[3-7][1-9]\d{4,7}|8[1-6]\d{4,7}|9[1-7]\d{4,7})$/.test(n)) return 'landline';
    return 'unknown';
  }
  if (e164.startsWith('+39')) {
    const n = e164.slice(3);
    if (/^3\d{8,9}$/.test(n)) return 'mobile';
    if (/^0\d{5,10}$/.test(n)) return 'landline';
    return 'unknown';
  }
  return 'unknown';
}

/**
 * URL за форма или профил в канонична форма: https, хост без „www.“ и без точка в края (IDN →
 * punycode), път с малки букви без „/“ в края; без потребител, порт, заявка и котва. LinkedIn
 * профил → https://linkedin.com/in/<slug> (bg.linkedin.com, „/“ в края, ?trk= — същият профил).
 */
export function normalizeUrl(raw: string): string | null {
  if (INVISIBLE_RE.test(raw)) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = canonicalDomain(u.hostname.replace(/^www\./, ''));
  if (!host) return null;
  const path = decodeURIComponentSafe(u.pathname).toLowerCase().replace(/\/+$/, '');
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
    const m = /^\/(in|company)\/([^/]+)/.exec(path);
    return m ? `https://linkedin.com/${m[1]}/${m[2]}` : `https://linkedin.com${path}`;
  }
  return `https://${host}${path}`;
}

function decodeURIComponentSafe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export function urlHost(normalizedUrl: string): string {
  return new URL(normalizedUrl).hostname;
}
