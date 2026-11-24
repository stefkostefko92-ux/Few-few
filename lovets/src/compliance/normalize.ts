import type { EmailKind, Market, PhoneKind } from './types.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/;

export function normalizeEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return EMAIL_RE.test(v) ? v : null;
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
  let v = raw.trim().replace(/[\s().\-/]/g, '');
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
  return E164_RE.test(v) ? v : null;
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

/** URL за форма или профил — само http(s). */
export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.toString();
  } catch {
    return null;
  }
}
