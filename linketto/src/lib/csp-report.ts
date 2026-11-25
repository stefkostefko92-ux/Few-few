// Докладите на CSP (Report-Only от nginx, deploy/nginx.conf) → кратък ред в дневника на app.
// Чиста логика (без Next/БД), тества се в __tests__/csp-report.test.ts.
//
// В дневника НЕ влизат лични данни: без IP, без user agent, без пълен адрес. Адресът на страницата
// се свежда до шаблон на маршрута (/u/*, /bg/dashboard) — slug-ът на профила и параметрите
// (токени в ?token=, ?ref=) отпадат. От блокирания ресурс остава само произходът
// (https://host) или ключовата дума (inline, eval, data…), никога пътят.
import { isLocale } from '@/i18n/locales';

/** Таван на тялото (nginx пуска до 64 KB; тук режем по-рано). */
export const CSP_REPORT_MAX_BYTES = 16 * 1024;
/** Най-много толкова доклада от една заявка (Reporting API праща масив). */
export const CSP_REPORT_MAX_ITEMS = 20;

export type CspLogEntry = {
  directive: string;
  blocked: string;
  page: string;
  disposition: 'report' | 'enforce';
};

const KEYWORDS = new Set(['inline', 'eval', 'wasm-eval', 'data', 'blob', 'self', 'trusted-types-policy', 'trusted-types-sink']);
// Префиксите извън езиковия рутинг (src/middleware.ts → matcher): съдържанието след тях е
// на потребител (slug, домейн, код) или файл — не се пише.
const OPAQUE = new Set(['u', 'd', 's', 'media', '_next']);

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Директивата: само букви и тирета (`script-src-elem`), иначе „other“. */
export function cleanDirective(raw: unknown): string {
  if (typeof raw !== 'string') return 'other';
  const first = raw.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return /^[a-z-]{2,40}$/.test(first) ? first : 'other';
}

/** Блокираното: произход (схема + хост) или ключова дума; никога път или параметри. */
export function cleanBlocked(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') return 'none';
  const value = raw.trim().toLowerCase();
  if (KEYWORDS.has(value)) return value;
  try {
    const url = new URL(value);
    const host = clip(url.host.replace(/[^a-z0-9.:[\]-]/g, ''), 100);
    if (url.protocol === 'data:' || url.protocol === 'blob:') return url.protocol.slice(0, -1);
    return host ? `${url.protocol}//${host}` : url.protocol;
  } catch {
    return 'other';
  }
}

/** Страницата → шаблон на маршрута без потребителски части. */
export function cleanPage(raw: unknown): string {
  if (typeof raw !== 'string') return '/*';
  let pathname: string;
  try {
    pathname = new URL(raw).pathname;
  } catch {
    return '/*';
  }
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return '/';
  const first = parts[0].toLowerCase();
  if (OPAQUE.has(first)) return `/${first}/*`;
  if (first === 'api') return /^[a-z-]{1,30}$/.test(parts[1] ?? '') ? `/api/${parts[1]}` : '/api/*';
  if (!isLocale(first)) return '/*'; // напр. /<slug> на краткия домейн (PROFILE_HOST)
  const second = parts[1]?.toLowerCase();
  if (!second) return `/${first}`;
  return /^[a-z][a-z-]{0,30}$/.test(second) ? `/${first}/${second}` : `/${first}/*`;
}

type Raw = Record<string, unknown>;

function entryFrom(body: Raw, fallbackDisposition: 'report' | 'enforce'): CspLogEntry {
  const disposition = body.disposition === 'enforce' ? 'enforce' : fallbackDisposition;
  return {
    directive: cleanDirective(body['effective-directive'] ?? body.effectiveDirective ?? body['violated-directive']),
    blocked: cleanBlocked(body['blocked-uri'] ?? body.blockedURL),
    page: cleanPage(body['document-uri'] ?? body.documentURL),
    disposition,
  };
}

/**
 * Разбира двата формата: `report-uri` ({"csp-report": {...}}, application/csp-report) и
 * Reporting API (масив [{type: "csp-violation", body: {...}}], application/reports+json).
 * Непознато → празен списък (маршрутът връща 204 и не пише нищо).
 */
export function parseCspReports(text: string): CspLogEntry[] {
  if (text.length === 0 || text.length > CSP_REPORT_MAX_BYTES) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const out: CspLogEntry[] = [];
  if (Array.isArray(data)) {
    for (const item of data.slice(0, CSP_REPORT_MAX_ITEMS)) {
      if (!item || typeof item !== 'object') continue;
      const report = item as Raw;
      if (report.type !== 'csp-violation' || !report.body || typeof report.body !== 'object') continue;
      out.push(entryFrom(report.body as Raw, 'report'));
    }
    return out;
  }
  if (data && typeof data === 'object') {
    const legacy = (data as Raw)['csp-report'];
    if (legacy && typeof legacy === 'object') out.push(entryFrom(legacy as Raw, 'report'));
  }
  return out;
}

/** Бюджет за дневника: най-много `max` реда за прозорец от `windowMs` (срещу наводнение). */
export function createLogBudget(max: number, windowMs: number): (now?: number) => boolean {
  let windowStart = 0;
  let used = 0;
  return (now = Date.now()) => {
    if (now - windowStart >= windowMs) {
      windowStart = now;
      used = 0;
    }
    if (used >= max) return false;
    used += 1;
    return true;
  };
}
