import type { Channel, Market } from '../compliance/types.js';

export interface Detected {
  channel: Channel;
  markets: Market[];
}

/**
 * Какво е въведено в търсачката: имейл, телефон или адрес на страница (LinkedIn профил или форма).
 * Пазарът: от номера (+359/+39), от домейна (.bg/.it), иначе от избора на човека, иначе и двата.
 */
export function detectQuery(query: string, market?: Market): Detected | null {
  const q = query.trim();
  if (!q) return null;
  if (q.includes('@')) {
    const tld = q.toLowerCase().split('.').pop();
    const byTld: Market | null = tld === 'bg' ? 'BG' : tld === 'it' ? 'IT' : null;
    return { channel: 'email', markets: market ? [market] : byTld ? [byTld] : ['BG', 'IT'] };
  }
  if (/^https?:\/\//i.test(q)) {
    const channel: Channel = /(^|\.)linkedin\.com$/i.test(safeHost(q)) ? 'linkedin' : 'form';
    const tld = safeHost(q).split('.').pop();
    const byTld: Market | null = tld === 'bg' ? 'BG' : tld === 'it' ? 'IT' : null;
    return { channel, markets: market ? [market] : byTld ? [byTld] : ['BG', 'IT'] };
  }
  if (/^[+\d][\d\s().\-/]{5,}$/.test(q)) {
    if (q.replace(/\s/g, '').startsWith('+359') || q.startsWith('00359')) {
      return { channel: 'phone', markets: ['BG'] };
    }
    if (q.replace(/\s/g, '').startsWith('+39') || q.startsWith('0039')) {
      return { channel: 'phone', markets: ['IT'] };
    }
    return { channel: 'phone', markets: market ? [market] : ['BG', 'IT'] };
  }
  return null;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}
