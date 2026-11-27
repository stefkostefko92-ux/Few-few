/**
 * Филтърът на изхода (SPEC §1.3): черновата не може да носи канарчето от системния промпт (и разредено),
 * чужд имейл адрес, връзка извън позволените домейни или HTML. Отказаната чернова не се пази.
 */
export type DraftProblem =
  'empty' | 'too_long' | 'canary' | 'foreign_email' | 'foreign_link' | 'html';

export interface GuardOptions {
  canary: string;
  /** Адресът на клиента — единственият чужд адрес, който може да се спомене. */
  customer: string;
  allowedDomains: string[];
}

const MAX_CHARS = 6000;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL = /\b(?:https?:\/\/|www\.)[^\s<>()"']+/gi;

const squash = (s: string): string =>
  s
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

function hostAllowed(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return allowed.some((d) => h === d || h.endsWith(`.${d}`));
}

export function checkDraft(text: string, o: GuardOptions): DraftProblem[] {
  const out: DraftProblem[] = [];
  if (!text.trim()) return ['empty'];
  if (text.length > MAX_CHARS) out.push('too_long');
  if (squash(text).includes(squash(o.canary))) out.push('canary');
  if (/<\/?[a-z][a-z0-9-]*[\s>/]|<!--/i.test(text)) out.push('html');
  const allowed = o.allowedDomains.map((d) => d.toLowerCase());
  for (const e of text.match(EMAIL) ?? []) {
    const addr = e.toLowerCase();
    if (addr !== o.customer.toLowerCase() && !hostAllowed(addr.split('@')[1] ?? '', allowed)) {
      out.push('foreign_email');
      break;
    }
  }
  for (const u of text.match(URL) ?? []) {
    let host = '';
    try {
      host = new globalThis.URL(u.startsWith('www.') ? `https://${u}` : u).hostname;
    } catch {
      out.push('foreign_link');
      break;
    }
    if (!hostAllowed(host, allowed)) {
      out.push('foreign_link');
      break;
    }
  }
  return out;
}
