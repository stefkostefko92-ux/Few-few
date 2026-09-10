import type { PostKind, PostStatus, Role } from '@prisma/client';
import { ROLE_LABEL } from '../auth/rbac.js';

/**
 * Как изглежда едно състояние пред човек: българска дума + икона + тон.
 * Живее тук, а не в шаблоните, защото се ползва на пет места и се тества.
 * Тонът НИКОГА не носи смисъла сам — иконата и думата вървят с него.
 */
export type Tone = 'neutral' | 'good' | 'warn' | 'serious' | 'critical' | 'info' | 'accent';

export interface Presented {
  label: string;
  icon: string;
  tone: Tone;
}

const POST_STATUS: Record<PostStatus, Presented> = {
  DRAFT: { label: 'Чернова', icon: 'status-draft', tone: 'neutral' },
  REJECTED: { label: 'Отказан', icon: 'status-rejected', tone: 'serious' },
  APPROVED: { label: 'Одобрен', icon: 'status-approved', tone: 'good' },
  SCHEDULED: { label: 'Насрочен', icon: 'status-scheduled', tone: 'info' },
  PUBLISHING: { label: 'Публикува се', icon: 'status-publishing', tone: 'warn' },
  PUBLISHED: { label: 'Публикуван', icon: 'status-published', tone: 'good' },
  FAILED: { label: 'Провален', icon: 'status-failed', tone: 'critical' },
};

const ACCOUNT_STATUS: Record<string, Presented> = {
  ACTIVE: { label: 'Активен', icon: 'status-active', tone: 'good' },
  TOKEN_EXPIRED: { label: 'Изтекъл токен', icon: 'status-token-expired', tone: 'critical' },
  DISABLED: { label: 'Спрян', icon: 'status-disabled', tone: 'neutral' },
};

const SEVERITY: Record<string, Presented> = {
  HIGH: { label: 'Блокира', icon: 'severity-high', tone: 'critical' },
  MEDIUM: { label: 'Внимание', icon: 'severity-medium', tone: 'warn' },
  INFO: { label: 'Бележка', icon: 'severity-info', tone: 'info' },
};

const ACTOR: Record<string, Presented> = {
  HUMAN: { label: 'Човек', icon: 'human', tone: 'neutral' },
  AGENT: { label: 'Агент', icon: 'agent', tone: 'info' },
  SYSTEM: { label: 'Система', icon: 'system', tone: 'neutral' },
};

const UNKNOWN: Presented = { label: '—', icon: 'severity-info', tone: 'neutral' };

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
    return { label: 'Автопилот', icon: 'autopilot', tone: 'accent' };
  }
  return actor(post.createdByType);
}

export function kind(value: PostKind | string): Presented {
  return value === 'REELS'
    ? { label: 'Reel', icon: 'reels', tone: 'neutral' }
    : { label: 'Снимка', icon: 'image', tone: 'neutral' };
}

export function roleLabel(role: Role): string {
  return ROLE_LABEL[role];
}

/** Хиляди с тънък интервал: 1 284 · 18 420. Дробните числа остават с десетична запетая. */
export function num(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('bg-BG').format(value);
}

/** Делта със знак — посоката се чете и без цвят. */
export function delta(
  value: number | null | undefined,
): { text: string; tone: 'up' | 'down' | 'flat'; icon: string } | null {
  if (value === null || value === undefined) return null;
  if (value === 0) return { text: '0', tone: 'flat', icon: 'trend-up' };
  const up = value > 0;
  return {
    text: `${up ? '+' : '−'}${num(Math.abs(value))}`,
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
 * `Intl` с „short“ месец за bg-BG връща „29.08.2026 г.“ — дълго и се пренася на два реда
 * в таблица. Съкращенията са ръчни, по правилата на българския (март, май, юни, юли не се
 * съкращават).
 */
const MONTHS = ['ян', 'фев', 'март', 'апр', 'май', 'юни', 'юли', 'авг', 'сеп', 'окт', 'ное', 'дек'];
const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

export function date(value: Date | null | undefined): string {
  if (!value) return '—';
  return `${value.getDate()} ${MONTHS[value.getMonth()]} ${value.getFullYear()}`;
}

export function dateTime(value: Date | null | undefined): string {
  if (!value) return '—';
  return `${date(value)}, ${new Intl.DateTimeFormat('bg-BG', TIME).format(value)}`;
}

/** „преди 3 дни“ / „след 2 часа“ — за колони, където точният час е шум. */
export function relative(value: Date | null | undefined, now = new Date()): string {
  if (!value) return '—';
  const diff = value.getTime() - now.getTime();
  const minutes = Math.round(diff / 60000);
  const formatter = new Intl.RelativeTimeFormat('bg-BG', { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(hours / 24), 'day');
}
