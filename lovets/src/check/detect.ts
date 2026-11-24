import { canonicalDomain, emailDomain, normalizeUrl, urlHost } from '../compliance/normalize.js';
import type { Channel, Market } from '../compliance/types.js';

export interface Detected {
  channel: Channel;
  markets: Market[];
}

function marketOfDomain(domain: string | null): Market | null {
  if (!domain) return null;
  if (domain.endsWith('.bg') || domain.endsWith('.xn--90ae')) return 'BG';
  if (domain.endsWith('.it')) return 'IT';
  return null;
}

/**
 * Какво е въведено: имейл, телефон или адрес на страница (LinkedIn профил или форма). Пазарът:
 * от номера (+359/+39) или от домейна (.bg/.it) — те печелят над избора на човека; иначе изборът;
 * иначе и двата (по-строгото се вижда в присъдата).
 */
export function detectQuery(query: string, market?: Market): Detected | null {
  const q = query.trim();
  if (!q) return null;
  const pick = (byValue: Market | null): Market[] =>
    byValue ? [byValue] : market ? [market] : ['BG', 'IT'];
  if (q.includes('@')) {
    return { channel: 'email', markets: pick(marketOfDomain(canonicalDomain(emailDomain(q)))) };
  }
  if (/^https?:\/\//i.test(q)) {
    const url = normalizeUrl(q);
    const host = url ? urlHost(url) : '';
    const channel: Channel = host === 'linkedin.com' ? 'linkedin' : 'form';
    return { channel, markets: pick(channel === 'form' ? marketOfDomain(host || null) : null) };
  }
  const compact = q.replace(/[\s().\-]/g, '');
  if (/^(\+|00)?\d{6,}$/.test(compact)) {
    if (/^(\+|00)359/.test(compact)) return { channel: 'phone', markets: ['BG'] };
    if (/^(\+|00)39/.test(compact)) return { channel: 'phone', markets: ['IT'] };
    return { channel: 'phone', markets: pick(null) };
  }
  return null;
}
