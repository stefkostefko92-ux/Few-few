/**
 * Филтърът на изхода (SPEC §1.3): черновата не може да носи канарчето от системния промпт (и разредено),
 * чужд имейл адрес, връзка извън позволените домейни или HTML. Отказаната чернова не се пази.
 */
export type DraftProblem =
  'empty' | 'too_long' | 'canary' | 'foreign_email' | 'foreign_link' | 'html' | 'sample_echo';

export interface GuardOptions {
  canary: string;
  /** Адресът на клиента — единственият чужд адрес, който може да се спомене. */
  customer: string;
  allowedDomains: string[];
  /** Образците за гласа: черновата не бива да ги повтаря — в тях са данни на други клиенти. */
  samples?: string[];
}

const MAX_CHARS = 6000;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL = /\b(?:https?:\/\/|www\.)[^\s<>()"']+/gi;
/** Гол домейн без схема („evil.example/login“) — пощенските клиенти го правят връзка сами. */
const BARE_HOST =
  /(?<![@\w.-])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})(?=[/:?#]|[\s,;)"'.!]|$)/gi;
/** Колко поредни думи от образец правят черновата „повторение“. */
const ECHO_WORDS = 8;
const words = (s: string): string[] =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];

function echoes(text: string, samples: string[]): boolean {
  const w = words(text);
  if (w.length < ECHO_WORDS) return false;
  const grams = new Set<string>();
  for (let i = 0; i + ECHO_WORDS <= w.length; i++) grams.add(w.slice(i, i + ECHO_WORDS).join(' '));
  return samples.some((s) => {
    const sw = words(s);
    for (let i = 0; i + ECHO_WORDS <= sw.length; i++)
      if (grams.has(sw.slice(i, i + ECHO_WORDS).join(' '))) return true;
    return false;
  });
}

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
  // Голите хостове — без адресите (частта след @ е проверена горе) и без явните URL (проверени долу).
  const noMail = text.replace(EMAIL, ' ').replace(URL, ' ');
  for (const m of noMail.matchAll(BARE_HOST)) {
    const host = m[1]!;
    if (!hostAllowed(host, allowed)) {
      out.push('foreign_link');
      break;
    }
  }
  if (!out.includes('foreign_link'))
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
  if (o.samples?.length && echoes(text, o.samples)) out.push('sample_echo');
  return out;
}
