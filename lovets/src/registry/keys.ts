import {
  canonicalDomain,
  emailDomain,
  normalizeEmail,
  normalizePhone,
  normalizeUrl,
  untaggedEmail,
  urlHost,
} from '../compliance/normalize.js';
import type { Market } from '../compliance/types.js';

/** Домейнът и родителските му домейни до регистрируемия (2 етикета): a.b.firma.bg → …, firma.bg. */
export function domainChain(domain: string): string[] {
  const labels = domain.split('.');
  const out: string[] = [];
  for (let i = 0; labels.length - i >= 2; i++) out.push(labels.slice(i).join('.'));
  return out;
}

/**
 * Ключовете, по които нормализирана стойност се търси в регистър или в „не ме търсете“: самата
 * стойност, адресът без „+таг“ и всички домейни над нея — вписан или отказан домейн обхваща и
 * поддомейните си. Първият ключ е точната стойност.
 */
export function lookupKeys(normalizedValue: string): string[] {
  if (normalizedValue.includes('@')) {
    const keys = [normalizedValue];
    const untagged = untaggedEmail(normalizedValue);
    if (untagged !== normalizedValue) keys.push(untagged);
    return [...keys, ...domainChain(emailDomain(normalizedValue))];
  }
  if (normalizedValue.startsWith('https://')) {
    return [normalizedValue, ...domainChain(urlHost(normalizedValue))];
  }
  if (normalizedValue.startsWith('+')) return [normalizedValue];
  return domainChain(normalizedValue);
}

const PHONE_LIKE = /^\+?\d{6,}$/;

/** Номер, въведен свободно: с международен префикс — един; национален — и за двата пазара. */
function phoneCandidates(raw: string, market: Market): string[] | null {
  const compact = raw.trim().replace(/[\s().\-]/g, '');
  if (!PHONE_LIKE.test(compact)) return null;
  if (compact.startsWith('+') || compact.startsWith('00')) {
    const p = normalizePhone(raw, market);
    return p ? [p] : [];
  }
  const both = [normalizePhone(raw, market), normalizePhone(raw, market === 'BG' ? 'IT' : 'BG')];
  return [...new Set(both.filter((p): p is string => p !== null))];
}

/**
 * Ключовете за запис в „не ме търсете“. Телефонът се разпознава първи (точките в „0888.123.456“ не
 * правят домейн). Национален номер без префикс → и БГ, и ИТ тълкуването (по-строгото). Празен
 * списък = неразпозната стойност.
 */
export function suppressionKeys(raw: string, scope: 'value' | 'domain', market: Market): string[] {
  const phones = phoneCandidates(raw, market);
  if (phones) return phones;
  if (raw.includes('@')) {
    const email = normalizeEmail(raw);
    if (!email) return [];
    return scope === 'domain' ? [emailDomain(email)] : [...new Set([email, untaggedEmail(email)])];
  }
  if (/^https?:\/\//i.test(raw.trim())) {
    const url = normalizeUrl(raw);
    if (!url) return [];
    return scope === 'domain' ? [urlHost(url)] : [url];
  }
  const domain = canonicalDomain(raw);
  return domain ? [domain] : [];
}

/** Ключът на съгласие: точната нормализирана стойност (телефонът — по пазара от записа). */
export function consentKey(raw: string, market: Market): string | null {
  if (raw.includes('@')) return normalizeEmail(raw);
  if (/^https?:\/\//i.test(raw.trim())) return normalizeUrl(raw);
  return normalizePhone(raw, market);
}
