import type { PostKind, PostStatus, Role } from '@prisma/client';
import type { Locale } from '../i18n.js';

/**
 * Как изглежда едно състояние пред човек: ключ за превод + икона + тон.
 * Живее тук, а не в шаблоните, защото се ползва на пет места и се тества.
 * Тонът НИКОГА не носи смисъла сам — иконата и думата вървят с него.
 */
export type Tone = 'neutral' | 'good' | 'warn' | 'serious' | 'critical' | 'info' | 'accent';

export interface Presented {
  /** Ключ в речниците (`status.PUBLISHED`) — шаблонът го превежда с `t()`. */
  key: string;
  icon: string;
  tone: Tone;
}

const POST_STATUS: Record<PostStatus, Presented> = {
  DRAFT: { key: 'status.DRAFT', icon: 'status-draft', tone: 'neutral' },
  REJECTED: { key: 'status.REJECTED', icon: 'status-rejected', tone: 'serious' },
  APPROVED: { key: 'status.APPROVED', icon: 'status-approved', tone: 'good' },
  SCHEDULED: { key: 'status.SCHEDULED', icon: 'status-scheduled', tone: 'info' },
  PUBLISHING: { key: 'status.PUBLISHING', icon: 'status-publishing', tone: 'warn' },
  PUBLISHED: { key: 'status.PUBLISHED', icon: 'status-published', tone: 'good' },
  FAILED: { key: 'status.FAILED', icon: 'status-failed', tone: 'critical' },
};

const ACCOUNT_STATUS: Record<string, Presented> = {
  ACTIVE: { key: 'status.ACTIVE', icon: 'status-active', tone: 'good' },
  TOKEN_EXPIRED: { key: 'status.TOKEN_EXPIRED', icon: 'status-token-expired', tone: 'critical' },
  DISABLED: { key: 'status.DISABLED', icon: 'status-disabled', tone: 'neutral' },
};

const SEVERITY: Record<string, Presented> = {
  HIGH: { key: 'status.HIGH', icon: 'severity-high', tone: 'critical' },
  MEDIUM: { key: 'status.MEDIUM', icon: 'severity-medium', tone: 'warn' },
  INFO: { key: 'status.INFO', icon: 'severity-info', tone: 'info' },
};

const ACTOR: Record<string, Presented> = {
  HUMAN: { key: 'status.HUMAN', icon: 'human', tone: 'neutral' },
  AGENT: { key: 'status.AGENT', icon: 'agent', tone: 'info' },
  SYSTEM: { key: 'status.SYSTEM', icon: 'system', tone: 'neutral' },
};

const UNKNOWN: Presented = { key: 'status.unknown', icon: 'severity-info', tone: 'neutral' };

/** Същият надпис, който `services/autopilot.ts` записва като актьор. */
const AUTOPILOT_LABEL = 'автопилот';

export function postStatus(status: PostStatus | string): Presented {
  return POST_STATUS[status as PostStatus] ?? UNKNOWN;
}

export function accountStatus(status: string): Presented {
  return ACCOUNT_STATUS[status] ?? UNKNOWN;
}

export function severity(level: string): Presented {
  return SEVERITY[level] ?? UNKNOWN;
}

export function actor(type: string): Presented {
  return ACTOR[type] ?? UNKNOWN;
}

/**
 * Кой е направил черновата. Автопилотът е системен актьор, но „Система“ не казва нищо
 * на ревюъра — показваме го по име, за да се вижда, че зад поста стои планът на страницата.
 */
export function creator(post: {
  createdByType: string;
  createdByLabel?: string | null;
}): Presented {
  if (post.createdByLabel === AUTOPILOT_LABEL) {
    return { key: 'status.AUTOPILOT', icon: 'autopilot', tone: 'accent' };
  }
  return actor(post.createdByType);
}

export function kind(value: PostKind | string): Presented {
  return value === 'REELS'
    ? { key: 'status.REELS', icon: 'reels', tone: 'neutral' }
    : { key: 'status.IMAGE', icon: 'image', tone: 'neutral' };
}

export function roleKey(role: Role): string {
  return `role.${role}`;
}

const INTL: Record<Locale, string> = { bg: 'bg-BG', en: 'en-GB', it: 'it-IT' };

/** Хиляди по правилата на езика: 18 420 · 18,420 · 18.420. */
export function num(value: number | null | undefined, locale: Locale = 'bg'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(INTL[locale]).format(value);
}

/** Делта със знак — посоката се чете и без цвят. */
export function delta(
  value: number | null | undefined,
  locale: Locale = 'bg',
): { text: string; tone: 'up' | 'down' | 'flat'; icon: string } | null {
  if (value === null || value === undefined) return null;
  if (value === 0) return { text: '0', tone: 'flat', icon: 'trend-up' };
  const up = value > 0;
  return {
    text: `${up ? '+' : '−'}${num(Math.abs(value), locale)}`,
    tone: up ? 'up' : 'down',
    icon: up ? 'trend-up' : 'trend-down',
  };
}

/** Квотата пожълтява на 75% и почервенява на 90% — числото винаги стои до лентата. */
export function quotaTone(used: number, total: number): Tone {
  if (total <= 0) return 'neutral';
  const share = used / total;
  if (share >= 0.9) return 'critical';
  if (share >= 0.75) return 'warn';
  return 'info';
}

/**
 * `Intl` със „short“ месец за bg-BG връща „29.08.2026 г.“ — дълго и се пренася на два реда
 * в таблица. За българския съкращенията са ръчни (март, май, юни, юли не се съкращават);
 * английският и италианският се справят сами.
 */
const MONTHS_BG = [
  'ян',
  'фев',
  'март',
  'апр',
  'май',
  'юни',
  'юли',
  'авг',
  'сеп',
  'окт',
  'ное',
  'дек',
];
const DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

export function date(value: Date | null | undefined, locale: Locale = 'bg'): string {
  if (!value) return '—';
  if (locale === 'bg') {
    return `${value.getDate()} ${MONTHS_BG[value.getMonth()]} ${value.getFullYear()}`;
  }
  return new Intl.DateTimeFormat(INTL[locale], DATE).format(value);
}

export function dateTime(value: Date | null | undefined, locale: Locale = 'bg'): string {
  if (!value) return '—';
  return `${date(value, locale)}, ${new Intl.DateTimeFormat(INTL[locale], TIME).format(value)}`;
}

/** „преди 3 дни“ / „2 days ago“ — за колони, където точният час е шум. */
export function relative(
  value: Date | null | undefined,
  locale: Locale = 'bg',
  now = new Date(),
): string {
  if (!value) return '—';
  const diff = value.getTime() - now.getTime();
  const minutes = Math.round(diff / 60000);
  const formatter = new Intl.RelativeTimeFormat(INTL[locale], { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(hours / 24), 'day');
}
