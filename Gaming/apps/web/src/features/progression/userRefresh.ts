import { useEffect } from "react";
import { api } from "../../lib/api";
import { useAuthStore } from "../../lib/store";

/** Най-много едно опресняване на профила за този интервал (при фокус на таба). */
export const USER_REFRESH_THROTTLE_MS = 30_000;

let lastRefreshAt = 0;
let inFlight: Promise<void> | null = null;

/**
 * Презарежда потребителя от `/auth/me`, за да се обновят чиповете/нивото в
 * хедъра (напр. след мач). `force` пропуска ограничението — за края на мач,
 * където наградата току-що е начислена. Грешките се поглъщат: опресняването е
 * удобство, не бива да чупи изгледа.
 */
export function refreshUser(force = false): Promise<void> {
  if (!useAuthStore.getState().user) return Promise.resolve();
  const now = Date.now();
  if (!force && now - lastRefreshAt < USER_REFRESH_THROTTLE_MS) return Promise.resolve();
  // Принудителното (край на мач) изчаква текущата заявка и пуска нова — тя може
  // да е тръгнала преди наградата да е начислена.
  if (inFlight) return force ? inFlight.then(() => refreshUser(true)) : inFlight;
  lastRefreshAt = now;
  inFlight = api
    .me()
    .then((r) => {
      // Не връщаме потребител, ако междувременно е излязъл.
      if (useAuthStore.getState().user) useAuthStore.getState().setUser(r.user);
    })
    .catch(() => undefined)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Опреснява профила, когато табът стане видим отново (с ограничение). */
export function useRefreshUserOnFocus(): void {
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshUser();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
}

/** Само за тестове: нулира вътрешното състояние на ограничението. */
export function __resetUserRefreshForTests(): void {
  lastRefreshAt = 0;
  inFlight = null;
}
