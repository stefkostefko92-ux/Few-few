import type { Prisma } from '@prisma/client';
import { ALL_ROLES } from '../auth/rbac.js';
import type { Translator } from '../i18n.js';
import { isOptionId, optionMonths } from '../plans/pricing.js';
import { PLAN_OUTCOMES } from '../plans/withdrawal.js';

/**
 * Подробностите на запис от одита като думи за панела: „Тестов период → Premium, 12 месеца, до …“
 * вместо JSON. Всяко действие има свое четене на полетата; непознато поле се показва като „ключ: стойност“,
 * за да не изчезне нищо от погледа на екипа.
 */

export interface DetailFormat {
  t: Translator;
  date: (value: Date) => string;
  /** Името на проект по id — само за „копие на …“ (проектите, които още ги има). */
  projectName: (id: string) => string | null;
}

type Fields = Record<string, unknown>;

const PLANS = ['TRIAL', 'PREMIUM', 'LIFETIME'];
const MAX_TEXT = 160;

const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
const clip = (text: string) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text);

function planName(value: unknown, t: Translator): string | null {
  const plan = str(value);
  if (!plan) return null;
  return PLANS.includes(plan) ? t(`plan.name.${plan}`) : plan;
}

function roleName(value: unknown, t: Translator): string | null {
  const role = str(value);
  if (!role) return null;
  return (ALL_ROLES as readonly string[]).includes(role) ? t(`role.${role}`) : role;
}

/** „от → към“, или само „към“, когато няма откъде. */
function change(from: string | null, to: string | null): string | null {
  if (from && to) return `${from} → ${to}`;
  return to ?? from;
}

function isoDate(value: unknown, f: DetailFormat): string | null {
  const text = str(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : f.date(date);
}

function optionText(value: unknown, t: Translator): string | null {
  if (!isOptionId(value)) return str(value);
  const months = optionMonths(value);
  return months === null ? t('plan.lifetime') : t('plan.months', { n: months });
}

function ordersParts(d: Fields, t: Translator): string[] {
  const kept = count(d.ordersKept);
  const cancelled = count(d.ordersCancelled);
  return [
    kept ? t('admin.audit.d.ordersKept', { n: kept }) : null,
    cancelled ? t('admin.audit.d.ordersCancelled', { n: cancelled }) : null,
  ].filter((part): part is string => part !== null);
}

type Reader = (d: Fields, f: DetailFormat) => Array<string | null>;

/**
 * Полетата, които всяко действие записва (виж audit(...) в src/services), прочетени като текст. Ключът е кодът
 * на действието с „_“ вместо „.“ (auditActionId) — така е и в речника (admin.audit.act.<ключ>).
 */
const READERS: Record<string, { keys: readonly string[]; read: Reader }> = {
  admin_plan_changed: {
    keys: ['from', 'to', 'months', 'until', 'request'],
    read: (d, { t, ...f }) => [
      change(planName(d.from, t), planName(d.to, t)),
      count(d.months) ? t('plan.months', { n: count(d.months) ?? 0 }) : null,
      str(d.until) ? t('plan.endsOn', { date: isoDate(d.until, { t, ...f }) ?? '' }) : null,
      str(d.request) ? t('admin.audit.d.byOrder') : null,
    ],
  },
  admin_role_changed: {
    keys: ['from', 'to', 'reauth'],
    read: (d, { t }) => [
      change(roleName(d.from, t), roleName(d.to, t)),
      d.reauth === true ? t('admin.audit.d.reauth') : null,
    ],
  },
  admin_account_created: {
    keys: ['role', 'plan', 'invited'],
    read: (d, { t }) => [
      roleName(d.role, t),
      planName(d.plan, t),
      d.invited === true ? t('admin.audit.d.invited') : t('admin.audit.d.withPassword'),
    ],
  },
  admin_account_edited: {
    keys: ['emailChanged', 'verifiedNow'],
    read: (d, { t }) => [
      d.emailChanged === true ? t('admin.audit.d.emailChanged') : null,
      d.verifiedNow === true ? t('admin.audit.d.verifiedNow') : null,
    ],
  },
  admin_account_banned: {
    keys: ['reason'],
    read: (d, { t }) => [
      str(d.reason) ? t('admin.audit.d.reason', { reason: str(d.reason) ?? '' }) : null,
    ],
  },
  admin_sessions_revoked: {
    keys: ['count'],
    read: (d, { t }) => [
      count(d.count) !== null ? t('admin.audit.d.sessions', { n: count(d.count) ?? 0 }) : null,
    ],
  },
  auth_session_revoked_others: {
    keys: ['count'],
    read: (d, { t }) => [
      count(d.count) !== null ? t('admin.audit.d.sessions', { n: count(d.count) ?? 0 }) : null,
    ],
  },
  admin_account_deleted: {
    keys: ['emailSha256', 'ordersKept', 'ordersCancelled'],
    read: (d, { t }) => [
      str(d.emailSha256)
        ? t('admin.audit.d.emailHash', { hash: `${(str(d.emailSha256) ?? '').slice(0, 12)}…` })
        : null,
      ...ordersParts(d, t),
    ],
  },
  account_deleted_self: {
    keys: ['ordersKept', 'ordersCancelled'],
    read: (d, { t }) => ordersParts(d, t),
  },
  account_registered: {
    keys: ['deviceConsent'],
    read: (d, f) => [
      str(d.deviceConsent)
        ? f.t('admin.audit.d.deviceConsent', { date: isoDate(d.deviceConsent, f) ?? '' })
        : null,
    ],
  },
  account_deviceConsent_withdrawn: {
    keys: ['version'],
    read: (d, f) => [
      str(d.version)
        ? f.t('admin.audit.d.consentText', { date: isoDate(d.version, f) ?? '' })
        : null,
    ],
  },
  plan_request_created: {
    keys: ['option', 'buyer', 'earlyStart', 'terms', 'replaced'],
    read: (d, f) => [
      optionText(d.option, f.t),
      d.buyer === 'CONSUMER'
        ? f.t('plan.buyer.consumerShort')
        : d.buyer === 'BUSINESS'
          ? f.t('plan.buyer.businessShort')
          : null,
      d.earlyStart === true ? f.t('admin.audit.d.earlyStart') : null,
      Array.isArray(d.replaced) && d.replaced.length
        ? f.t('admin.audit.d.replaces', { n: d.replaced.length })
        : null,
      str(d.terms) ? f.t('admin.audit.d.terms', { date: isoDate(d.terms, f) ?? '' }) : null,
    ],
  },
  plan_request_withdrawn: {
    keys: ['plan', 'earlyStart'],
    read: (d, { t }) => [
      (PLAN_OUTCOMES as readonly unknown[]).includes(d.plan)
        ? t(`admin.audit.d.outcome.${String(d.plan)}`)
        : str(d.plan),
      d.earlyStart === true ? t('admin.audit.d.earlyStart') : null,
    ],
  },
  project_duplicated: {
    keys: ['from'],
    read: (d, f) => {
      const from = str(d.from);
      const name = from ? f.projectName(from) : null;
      return [from ? f.t('admin.audit.d.copyOf', { name: name ?? `${from.slice(0, 8)}…` }) : null];
    },
  },
  // собственикът на изтегления проект е в колоната „Обект“
  admin_project_exported: { keys: ['userId'], read: () => [] },
  system_unverified_purged: {
    keys: ['count'],
    read: (d, { t }) => [
      count(d.count) !== null ? t('admin.audit.d.accounts', { n: count(d.count) ?? 0 }) : null,
    ],
  },
};

function plain(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return String(value.length);
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Кодът на действието като ключ: `auth.session.revoked.others` → `auth_session_revoked_others`. */
export function auditActionId(action: string): string {
  return action.replaceAll('.', '_');
}

/** Подробностите на записа като кратки части за показ (празен списък — няма какво да се каже). */
export function auditDetail(
  action: string,
  detail: Prisma.JsonValue | null,
  f: DetailFormat,
): string[] {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return [];
  const fields = detail as Fields;
  const id = auditActionId(action);
  const reader = Object.hasOwn(READERS, id) ? READERS[id] : undefined;
  const known = new Set(reader?.keys ?? []);
  const parts = reader ? reader.read(fields, f) : [];
  // поле, което четецът не познава (ново в кода, или от стара версия), не се губи
  for (const [key, value] of Object.entries(fields)) {
    if (!known.has(key) && value !== null && value !== undefined)
      parts.push(`${key}: ${plain(value)}`);
  }
  return parts
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .map(clip);
}
