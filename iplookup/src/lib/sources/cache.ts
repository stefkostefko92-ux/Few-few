import "server-only";

import { USER_AGENT } from "./base";

/**
 * Кеш за големите списъци (диапазони на доставчици, Tor изходи, Spamhaus DROP).
 *
 * Три неща, които решава наведнъж:
 *
 * 1. **Учтивост.** Spamhaus иска не по-често от веднъж на час; списъците на
 *    облачните доставчици са мегабайти. Свалянето при всяка заявка е и грубо,
 *    и бавно.
 * 2. **Едно сваляне, не сто.** Първите паралелни заявки след старт биха пуснали
 *    по едно теглене всяка — затова течащото обещание се споделя.
 * 3. **Старото е по-добро от нищо.** Падне ли източникът, връщаме последното
 *    успешно съдържание вместо празнота. Справката пак става, само че с
 *    по-стари данни — и това си личи в интерфейса.
 */

interface Entry<T> {
  value: T;
  loadedAt: number;
  /** Течащото зареждане — за да не тръгват няколко наведнъж. */
  inflight?: Promise<T | null>;
}

const store = new Map<string, Entry<unknown>>();

export interface CachedValue<T> {
  value: T;
  /** Кога е свалено — показваме го, за да е видима възрастта на данните. */
  loadedAt: number;
  /** Изтекло ли е TTL-ът (тоест показваме старо съдържание след провал)? */
  stale: boolean;
}

/**
 * Взима стойността от кеша или я зарежда. Никога не хвърля — при провал без
 * налично старо копие връща `null`.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 15_000,
): Promise<CachedValue<T> | null> {
  const existing = store.get(key) as Entry<T> | undefined;
  const fresh = existing && Date.now() - existing.loadedAt < ttlMs;
  if (fresh) return { value: existing.value, loadedAt: existing.loadedAt, stale: false };

  if (existing?.inflight) {
    const value = await existing.inflight;
    if (value !== null) {
      const updated = store.get(key) as Entry<T> | undefined;
      return updated ? { value: updated.value, loadedAt: updated.loadedAt, stale: false } : null;
    }
    return existing.value !== undefined
      ? { value: existing.value, loadedAt: existing.loadedAt, stale: true }
      : null;
  }

  const inflight = loader(AbortSignal.timeout(timeoutMs))
    .then((value) => {
      store.set(key, { value, loadedAt: Date.now() });
      return value;
    })
    .catch(() => {
      // Провалът не трие кеша — старото копие остава да върши работа.
      if (existing) store.set(key, { value: existing.value, loadedAt: existing.loadedAt });
      return null;
    });

  store.set(key, { value: existing?.value as T, loadedAt: existing?.loadedAt ?? 0, inflight });

  const value = await inflight;
  if (value !== null) {
    const updated = store.get(key) as Entry<T>;
    return { value: updated.value, loadedAt: updated.loadedAt, stale: false };
  }
  return existing?.value !== undefined
    ? { value: existing.value, loadedAt: existing.loadedAt, stale: true }
    : null;
}

/** Сваля текст от ФИКСИРАН адрес (виж бележката за SSRF в `base.ts`). */
export async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    signal,
    headers: { "user-agent": USER_AGENT },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

/** Само за тестове и диагностика — изпразва кеша. */
export function resetCache(): void {
  store.clear();
}
