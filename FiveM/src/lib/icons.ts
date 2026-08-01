import type { FrameworkId, ProbeOutcome } from './fivem';

/**
 * Картата етикет → икона. Етикетите на сървърите са свободен текст (идват от
 * подателя), затова липсващото съответствие е нормално състояние, а не грешка:
 * етикет без икона просто се показва като текст.
 *
 * Пълният списък с имена е в `docs/ICONS.md` — той е договорът с дизайнера.
 */
export const STATUS_ICON: Record<ProbeOutcome, string> = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  HIDDEN: 'hidden',
  UNREACHABLE: 'unreachable',
};

export const FRAMEWORK_ICON: Record<FrameworkId, string> = {
  ESX: 'esx',
  QBCORE: 'qbcore',
  QBOX: 'qbox',
  OX_CORE: 'ox-core',
  STANDALONE: 'standalone',
  UNKNOWN: 'unknown',
};

/** Български и английски изписвания сочат към една и съща икона. */
const TAG_ICON: Record<string, string> = {
  'heavy-rp': 'heavy-rp',
  'light-rp': 'light-rp',
  whitelist: 'whitelist',
  'без whitelist': 'open',
  'свободен вход': 'open',
  икономика: 'economy',
  economy: 'economy',
  полиция: 'police',
  police: 'police',
  линейка: 'medic',
  болница: 'medic',
  medic: 'medic',
  съд: 'court',
  court: 'court',
  drift: 'drift',
  дрифт: 'drift',
  racing: 'racing',
  надбягвания: 'racing',
  тунинг: 'tuning',
  tuning: 'tuning',
  банди: 'gangs',
  gangs: 'gangs',
  работа: 'jobs',
  jobs: 'jobs',
  жилища: 'housing',
  housing: 'housing',
  занаяти: 'crafting',
  crafting: 'crafting',
  транспорт: 'transport',
  transport: 'transport',
  нов: 'new',
  new: 'new',
  '18+': '18plus',
  тематичен: 'new',
};

export function tagIcon(tag: string): string | null {
  return TAG_ICON[tag.trim().toLowerCase()] ?? null;
}
