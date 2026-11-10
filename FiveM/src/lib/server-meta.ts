/**
 * `<title>` и meta description на страница на сървър — от СОБСТВЕНИТЕ факти
 * на сървъра, не от едно изречение за сайта. ЧИСТИ функции (тествани):
 * думите идват от речника, датите — вече форматирани от викащия.
 *
 * Дотук описанието беше „<име>: ESX. Всички български FiveM RP сървъри на
 * едно място…“ — второто изречение еднакво на 2076 адреса. Google изрично
 * съветва автоматично генерираните описания да се строят от данните на
 * конкретната страница; точно това се прави тук, без нищо измислено: всяко
 * парче идва от поле, което страницата показва.
 */

import { fitAtWord } from './server-identity';

const INTL_LOCALE: Record<string, string> = { bg: 'bg-BG', en: 'en-GB' };

/**
 * Дата за показване — в **Europe/Sofia**, както графиката (`bucketHourLabels`):
 * рендерът е на сървъра, а VPS-ът е в UTC, тоест без изрична зона „последно
 * онлайн“ около полунощ излизаше с вчерашна дата.
 */
export function formatDay(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale] ?? 'bg-BG', {
    dateStyle: 'medium',
    timeZone: 'Europe/Sofia',
  }).format(date);
}

/** Дата и час — за „последна проверка“, която е на минути, не на дни. */
export function formatMoment(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale] ?? 'bg-BG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Sofia',
  }).format(date);
}

/**
 * Таван на заглавието на страницата БЕЗ бранда: шаблонът в `layout.tsx`
 * добавя „ · FiveM BG“ (11 знака), значи цялото заглавие остава ≤ 60.
 */
export const SERVER_TITLE_MAX = 49;

export type TitleWords = {
  /** „FiveM RP сървър“ — когато рамката е неизвестна. */
  titleSuffix: string;
  /** „FiveM сървър“ — след етикета на рамката: „ESX FiveM сървър“. */
  titleSuffixFramework: string;
};

/**
 * „Nova RP — ESX FiveM сървър“. Не се ли събира в тавана, остава само името
 * (отрязано по дума) — по-добре кратко и вярно, отколкото с рязана наставка.
 */
export function serverPageTitle(
  name: string,
  frameworkLabel: string | null,
  words: TitleWords,
  max = SERVER_TITLE_MAX,
): string {
  const suffix = frameworkLabel ? `${frameworkLabel} ${words.titleSuffixFramework}` : words.titleSuffix;
  const full = `${name} — ${suffix}`;
  if (full.length <= max) return full;
  const short = `${name} — ${words.titleSuffix}`;
  if (frameworkLabel && short.length <= max) return short;
  return fitAtWord(name, max);
}

export type DescriptionWords = TitleWords & {
  metaWhitelist: string;
  metaOpen: string;
  metaSlots: string;
  metaOnline: string;
  metaHidden: string;
  metaLastOnline: string;
  metaNotSeen: string;
  metaPeak: string;
  metaPlayers: string;
  metaDiscord: string;
  metaReviews: string;
};

export type ServerFacts = {
  /** Вече изчистеното име (`serverTitle`). */
  name: string;
  /** Етикетът на РАЗПОЗНАТА рамка; `null` при неизвестна/собствена. */
  frameworkLabel: string | null;
  whitelist: boolean;
  maxPlayers: number;
  lastProbe: 'ONLINE' | 'OFFLINE' | 'HIDDEN' | 'UNREACHABLE';
  /** Последно онлайн, вече форматирано за езика; `null` — не е виждан. */
  lastOnlineLabel: string | null;
  /** Максимумът играчи за последните 24 часа (0 — няма история). */
  peak24h: number;
  hasDiscord: boolean;
  approvedReviews: number;
  /** Краткото описание от собственика, ако има. */
  tagline: string | null;
};

/** Изречение без двойна точка накрая. */
function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Описанието се сглобява от фактите в реда на важност и се реже по ЦЯЛО
 * изречение, щом мине тавана: половин изречение в резултата изглежда по-зле от
 * едно изречение по-малко.
 */
export function serverMetaDescription(facts: ServerFacts, words: DescriptionWords, max = 160): string {
  const kind = facts.frameworkLabel
    ? `${facts.frameworkLabel} ${words.titleSuffixFramework}`
    : words.titleSuffix;
  const lead = [
    `${facts.name} — ${kind}`,
    facts.whitelist ? words.metaWhitelist : words.metaOpen,
    facts.maxPlayers > 0 ? `${facts.maxPlayers} ${words.metaSlots}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const status =
    facts.lastProbe === 'ONLINE'
      ? words.metaOnline
      : facts.lastProbe === 'HIDDEN'
        ? words.metaHidden
        : facts.lastOnlineLabel
          ? `${words.metaLastOnline}: ${facts.lastOnlineLabel}`
          : words.metaNotSeen;

  const parts = [
    facts.tagline ? sentence(facts.tagline) : null,
    sentence(lead),
    sentence(status),
    facts.peak24h > 0 ? sentence(`${words.metaPeak}: ${facts.peak24h} ${words.metaPlayers}`) : null,
    facts.hasDiscord ? sentence(words.metaDiscord) : null,
    facts.approvedReviews > 0 ? sentence(`${words.metaReviews}: ${facts.approvedReviews}`) : null,
  ].filter((part): part is string => Boolean(part));

  let out = '';
  for (const part of parts) {
    const next = out ? `${out} ${part}` : part;
    if (next.length > max) break;
    out = next;
  }
  // Дори първото изречение да не се събира (дълъг tagline) — режем по дума.
  return out || fitAtWord(parts[0] ?? facts.name, max);
}
