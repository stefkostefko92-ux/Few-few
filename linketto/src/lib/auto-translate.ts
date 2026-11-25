// Автоматичен превод на публичния профил — чистата част (тества се без база).
// Спецификация: docs/geo-autotranslate-spec.md (Б). Кешът и извикването на
// Gemini са в auto-translate-server.ts.

import { createHash } from 'node:crypto';
import { HREFLANG_LOCALES, localeForCountry } from '@/i18n/locales';
import type { TranslatableContent } from '@/lib/ai';

/** Езиците, на които превеждаме автоматично: всички наши без диалектите. */
const AUTO_LOCALES: readonly string[] = HREFLANG_LOCALES;

const BOT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|facebot|embedly|preview|whatsapp|telegram|discord|skype|bingpreview|headless|lighthouse|pagespeed/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  return !!ua && BOT_RE.test(ua);
}

/** Езиците от Accept-Language по тежест (само основната част: „pt-BR“ → „pt“). */
function acceptedLanguages(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { tag: (tag ?? '').toLowerCase().split('-')[0] ?? '', q: q ? Number(q) : 1 };
    })
    .filter((item) => item.tag && item.tag !== '*' && !Number.isNaN(item.q) && item.q > 0)
    .sort((a, b) => b.q - a.q)
    .map((item) => item.tag);
}

/**
 * Включен ли е автоматичният превод сега: 'on' — да; 'off' — създателят е
 * възразил; 'pending' (профил отпреди функцията) — едва от autoTranslateStartsAt
 * (≥14 дни след уведомлението до създателя).
 */
export function autoTranslateActive(
  profile: { autoTranslateMode: string; autoTranslateStartsAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (profile.autoTranslateMode === 'on') return true;
  if (profile.autoTranslateMode !== 'pending' || !profile.autoTranslateStartsAt) return false;
  return now.getTime() >= profile.autoTranslateStartsAt.getTime();
}

export type ProfileView = { locale: string; mode: 'own' | 'auto' };

/**
 * На какъв език да покажем профила и дали с превода на създателя ('own') или
 * автоматичен ('auto'). Редът е в спецификацията (Б, т. 1–2).
 */
export function pickProfileView(opts: {
  hl?: string;
  country: string | null;
  acceptLanguage: string | null;
  available: readonly string[];
  defaultLocale: string;
  autoTranslate: boolean;
  isBot: boolean;
}): ProfileView {
  const own = (loc: string | null | undefined) => !!loc && opts.available.includes(loc);
  const canAuto = (loc: string | null | undefined) =>
    !!loc && opts.autoTranslate && !opts.isBot && AUTO_LOCALES.includes(loc);
  const view = (loc: string): ProfileView | null =>
    own(loc) ? { locale: loc, mode: 'own' } : canAuto(loc) ? { locale: loc, mode: 'auto' } : null;

  // 1. Изричен избор.
  if (opts.hl) {
    const explicit = view(opts.hl);
    if (explicit) return explicit;
  }
  const accepted = acceptedLanguages(opts.acceptLanguage);
  // 2а. Основният език на браузъра, ако създателят го има.
  if (own(accepted[0])) return { locale: accepted[0]!, mode: 'own' };
  // 2б. Езикът на държавата (свой или автоматичен).
  const byCountry = view(localeForCountry(opts.country) ?? '');
  if (byCountry) return byCountry;
  // 2в. Друг език от браузъра, който създателят има.
  const ownAccepted = accepted.find((loc) => own(loc));
  if (ownAccepted) return { locale: ownAccepted, mode: 'own' };
  // 2г. Автоматичен превод на основния език на браузъра.
  if (canAuto(accepted[0])) return { locale: accepted[0]!, mode: 'auto' };
  // 2д. Основният език на профила.
  const fallback = own(opts.defaultLocale) ? opts.defaultLocale : (opts.available[0] ?? opts.defaultLocale);
  return { locale: fallback, mode: 'own' };
}

type SourceProfile = {
  defaultLocale: string;
  translations: { locale: string; displayName: string; bio: string | null }[];
  links: { id: string; translations: { locale: string; title: string }[] }[];
  products: { id: string; translations: { locale: string; title: string; description: string | null }[] }[];
};

/** Таван на подканата (червен екип): иначе профил с хиляди блокове = огромни заявки. */
export const AUTO_MAX_LINKS = 60;
export const AUTO_MAX_SOURCE_CHARS = 8000;

/**
 * Съдържанието за превод — от основния език на профила (или първия наличен).
 * null, ако няма какво или ако е над тавана (тогава — без автоматичен превод).
 */
export function profileSource(profile: SourceProfile): { from: string; content: TranslatableContent } | null {
  const main =
    profile.translations.find((t) => t.locale === profile.defaultLocale) ?? profile.translations[0];
  if (!main) return null;
  const pick = <T extends { locale: string }>(items: T[]) =>
    items.find((item) => item.locale === main.locale) ?? items[0];
  const source = {
    from: main.locale,
    content: {
      displayName: main.displayName,
      bio: main.bio,
      links: profile.links
        .map((link) => ({ id: link.id, title: pick(link.translations)?.title ?? '' }))
        .filter((link) => link.title),
      // Само заглавията: описанията и условията на продуктите са търговски
      // текст — грешен машинен превод би подвел купувача (правен преглед).
      products: profile.products
        .map((product) => ({ id: product.id, title: pick(product.translations)?.title ?? '', description: null }))
        .filter((product) => product.title),
    },
  };
  if (source.content.links.length > AUTO_MAX_LINKS) return null;
  if (JSON.stringify(source.content).length > AUTO_MAX_SOURCE_CHARS) return null;
  return source;
}

/** Хеш на изходното съдържание — промяна → кешираният превод е невалиден. */
export function sourceHash(source: { from: string; content: TranslatableContent }): string {
  return createHash('sha256').update(JSON.stringify(source)).digest('hex');
}

export type AutoEntry = {
  displayName: string;
  bio?: string;
  links: Record<string, string>;
  products?: Record<string, { title?: string; description?: string }>;
};

type ViewProfile = {
  id: string;
  translations: { id: string; profileId: string; locale: string; displayName: string; bio: string | null }[];
  links: { id: string; translations: { id: string; linkId: string; locale: string; title: string }[] }[];
  products: {
    id: string;
    translations: { id: string; productId: string; locale: string; title: string; description: string | null }[];
  }[];
};

const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

/**
 * Профилът за показване с автоматичния превод като още един език (копие —
 * оригиналът не се пипа). Липсващо/невалидно поле → остава оригиналът
 * (ProfileScreen пада към основния език за него).
 */
export function applyAutoTranslation<P extends ViewProfile>(
  profile: P,
  locale: string,
  entry: AutoEntry,
  from: string,
): P {
  const fromOf = <T extends { locale: string }>(items: T[]) =>
    items.find((item) => item.locale === from) ?? items[0];
  const main = fromOf(profile.translations);
  const displayName = text(entry.displayName, 100) ?? main?.displayName ?? '';
  const bio = text(entry.bio, 500) ?? main?.bio ?? null;
  const translations = [
    ...profile.translations.filter((t) => t.locale !== locale),
    { id: `auto-${locale}`, profileId: profile.id, locale, displayName, bio } as P['translations'][number],
  ];
  const links = profile.links.map((link) => {
    const title = text(entry.links?.[link.id], 100);
    if (!title) return link;
    return {
      ...link,
      translations: [
        ...link.translations.filter((t) => t.locale !== locale),
        { id: `auto-${locale}`, linkId: link.id, locale, title } as (typeof link.translations)[number],
      ],
    };
  });
  const products = profile.products.map((product) => {
    const item = entry.products?.[product.id];
    const title = text(item?.title, 120);
    if (!title) return product;
    // Описанието остава оригиналното (не се превежда машинно).
    const original = fromOf(product.translations);
    return {
      ...product,
      translations: [
        ...product.translations.filter((t) => t.locale !== locale),
        {
          id: `auto-${locale}`,
          productId: product.id,
          locale,
          title,
          description: original?.description ?? null,
        } as (typeof product.translations)[number],
      ],
    };
  });
  return { ...profile, translations, links, products };
}

/** Прост почасов лимит по ключ (в паметта на единствения процес). */
export function createHourlyLimiter(max: number, now: () => number = Date.now): (key: string) => boolean {
  const hits = new Map<string, number[]>();
  return (key) => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((at) => t - at < 60 * 60 * 1000);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.delete(hits.keys().next().value as string);
    return true;
  };
}

/** Ключове, които „помним“ за ttlMs (напр. неуспешен превод — да не плащаме пак веднага). */
export function createTtlSet(
  ttlMs: number,
  max = 10_000,
  now: () => number = Date.now,
): { has(key: string): boolean; add(key: string): void } {
  const until = new Map<string, number>();
  return {
    has(key) {
      const at = until.get(key);
      if (at === undefined) return false;
      if (now() >= at) {
        until.delete(key);
        return false;
      }
      return true;
    },
    add(key) {
      if (until.size >= max) until.delete(until.keys().next().value as string);
      until.set(key, now() + ttlMs);
    },
  };
}
