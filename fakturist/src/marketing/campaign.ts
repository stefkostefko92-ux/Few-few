import type { Locale } from '../i18n.js';

/**
 * Откъде идва регистрацията (SPEC 93; собственикът, 23.11.2026 — „да започнем реклама“): етикетът на
 * кампанията от адреса (`utm_*`) или — без него — хостът на външния сайт, от който идва посетителят
 * (`Referer`, само хостът). Не се пази нищо в браузъра (без бисквитки и хранилище — без банер за
 * съгласие): етикетът се носи в адресите на витрината и в скритите полета на формата за регистрация и се
 * записва на фирмата при регистрацията. Етикетите не са лични данни — само имена на кампании и сайтове.
 */
export interface Campaign {
  source: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

/** Полетата и параметрите им в адреса — по стандарта на utm. */
export const CAMPAIGN_FIELDS = [
  ['source', 'utm_source'],
  ['medium', 'utm_medium'],
  ['campaign', 'utm_campaign'],
  ['content', 'utm_content'],
  ['term', 'utm_term'],
] as const;

export const CAMPAIGN_MAX = 100;
/** Букви и цифри (и на кирилица), интервал и . _ - + / : — без кавички, ъглови скоби и управляващи знаци. */
const SAFE = /^[\p{L}\p{N} ._+\-/:]+$/u;

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (text === '' || text.length > CAMPAIGN_MAX || !SAFE.test(text)) return undefined;
  return text;
}

function refererHost(referer: string | undefined, selfHost: string): string | undefined {
  if (!referer) return undefined;
  let url: URL;
  try {
    url = new URL(referer);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  const host = url.hostname.toLowerCase();
  if (host === '' || host === selfHost.toLowerCase()) return undefined;
  return clean(host);
}

/** Етикетът от параметрите на адреса (или от полетата на формата — същите имена). */
export function readCampaign(
  query: Record<string, unknown>,
  referer: string | undefined,
  selfHost: string,
): Campaign | null {
  const source = clean(query['utm_source']);
  if (!source) {
    const host = refererHost(referer, selfHost);
    return host ? { source: host, medium: 'referral' } : null;
  }
  const campaign: Campaign = { source };
  for (const [field, param] of CAMPAIGN_FIELDS) {
    if (field === 'source') continue;
    const value = clean(query[param]);
    if (value) campaign[field] = value;
  }
  return campaign;
}

/** `utm_source=…&utm_medium=…` — само попълнените полета. */
export function campaignQuery(campaign: Campaign | null): string {
  if (!campaign) return '';
  const params = new URLSearchParams();
  for (const [field, param] of CAMPAIGN_FIELDS) {
    const value = campaign[field];
    if (value) params.set(param, value);
  }
  return params.toString();
}

/** Адрес на витрината или към регистрацията/входа с езика на посетителя и етикета на кампанията. */
export function withQuery(path: string, locale: Locale, campaign: Campaign | null): string {
  const parts = [locale === 'en' ? 'lang=en' : '', campaignQuery(campaign)].filter(Boolean);
  return parts.length > 0 ? `${path}?${parts.join('&')}` : path;
}
