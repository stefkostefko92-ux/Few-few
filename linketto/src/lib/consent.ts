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

/** Сериализира избора за бисквитката: "v1:granted" / "v1:denied". */
export function serializeConsent(choice: ConsentChoice): string {
  return `${CONSENT_VERSION}:${choice}`;
}

/**
 * Разчита стойност от бисквитката. Непозната/стара версия → null (питаме пак).
 * Никога не хвърля — повреден вход просто значи „няма валиден избор“.
 */
export function parseConsent(raw: string | undefined | null): ConsentChoice | null {
  if (!raw) return null;
  const [version, choice] = raw.split(':');
  if (version !== CONSENT_VERSION) return null;
  return choice === 'granted' || choice === 'denied' ? choice : null;
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
