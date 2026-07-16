// Съгласие за рекламни тагове (CMP) — чисти функции, тествани в __tests__/consent.test.ts.
//
// Философия: linketto е „аналитика без бисквитки“ по дизайн — собствената ни аналитика
// (ClickEvent) не ползва бисквитки и НЕ иска съгласие. Този модул пази единствено
// РЕКЛАМНИТЕ тагове (Google Ads / Meta Pixel), които се зареждат само при: (а) зададено
// NEXT_PUBLIC_* ID и (б) изрично „Приемам“ от посетителя (ePrivacy: съгласие ПРЕДИ
// изстрелване; Basic Consent Mode — без съгласие тагът изобщо не се зарежда).

export const CONSENT_COOKIE = 'linketto_consent';
export const CONSENT_VERSION = 'v1';
/** 180 дни — после питаме отново (свежест на съгласието). */
export const CONSENT_MAX_AGE_S = 180 * 24 * 60 * 60;

export type ConsentChoice = 'granted' | 'denied';

/**
 * Сериализира избора: "v1:granted:1720000000" (unix секунди на решението).
 * Timestamp-ът е част от отчетността по чл. 7(1) GDPR — КОГА е дадено съгласието.
 */
export function serializeConsent(choice: ConsentChoice, decidedAtMs = Date.now()): string {
  return `${CONSENT_VERSION}:${choice}:${Math.floor(decidedAtMs / 1000)}`;
}

/**
 * Разчита стойност от бисквитката. Непозната/стара версия → null (питаме пак).
 * Толерантен към липсващ timestamp (стар формат). Никога не хвърля.
 */
export function parseConsent(raw: string | undefined | null): ConsentChoice | null {
  if (!raw) return null;
  const [version, choice] = raw.split(':');
  if (version !== CONSENT_VERSION) return null;
  return choice === 'granted' || choice === 'denied' ? choice : null;
}

/** Unix секунди на решението (null при стар/повреден формат). */
export function consentDecidedAt(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const [version, , ts] = raw.split(':');
  if (version !== CONSENT_VERSION) return null;
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Префикси на рекламните бисквитки, които заличаваме при отказ/оттегляне
 * (чл. 7(3) GDPR: оттеглянето спира обработката — сигналът denied не стига).
 */
export const AD_COOKIE_PREFIXES = ['_fbp', '_fbc', '_gcl_', '_ga'] as const;

/** Имената на бисквитките от cookie header-а, които са рекламни. */
export function adCookieNames(cookieHeader: string): string[] {
  return cookieHeader
    .split(';')
    .map((part) => part.trim().split('=')[0])
    .filter((name) => AD_COOKIE_PREFIXES.some((prefix) => name.startsWith(prefix)));
}

/** Чете избора от document.cookie низ (за клиентския банер). */
export function consentFromCookieHeader(cookieHeader: string): ConsentChoice | null {
  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(match ? decodeURIComponent(match.slice(CONSENT_COOKIE.length + 1)) : null);
}

/** Има ли изобщо конфигурирани рекламни тагове? Без ID-та банерът не се показва. */
export function adTagsConfigured(googleAdsId?: string, metaPixelId?: string): boolean {
  return Boolean(googleAdsId?.trim() || metaPixelId?.trim());
}
