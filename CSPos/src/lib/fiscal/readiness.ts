// Готовност на ФУ (Прил. № 29, т. 8), сверка на часа (т. 5) и забрана за демо режим (т. 20).
//
// т. 8: свързаността се проверява (1) при старт на екрана за продажби, (2) при откриване на
// продажба — ИН на ФУ от връзка до 2 часа назад, (3) при плащане — на живо, ПРЕДИ картата.
// Неуспех → функционалността се блокира (503), не „опитай пак по-късно“ с тиха продажба.
// Тук е чистата логика; заявките към ФУ и базата са в ./link.ts.

export const LINK_MAX_AGE_MS = 2 * 60 * 60 * 1000;
/** Над толкова разлика между часа на ФУ и на касата лентата предупреждава. */
export const CLOCK_WARN_MS = 2 * 60 * 1000;
/** Поне веднъж в работния ден (т. 5). */
export const CLOCK_SYNC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isLinkFresh(okAtIso: string | null | undefined, now: Date, maxMs = LINK_MAX_AGE_MS): boolean {
  if (!okAtIso) return false;
  const t = Date.parse(okAtIso);
  if (Number.isNaN(t)) return false;
  const age = now.getTime() - t;
  return age >= 0 && age <= maxMs;
}

/**
 * Отместване на часа: час на ФУ − час на касата (ms). ФУ връщат местно време без зона
 * („2026-11-14T12:01:30“), затова то се тълкува в зоната на касата.
 */
export function clockOffsetMs(
  deviceIso: string | null | undefined,
  localNow: Date,
  tzOffsetMinutes = -localNow.getTimezoneOffset()
): number | null {
  if (!deviceIso) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(deviceIso);
  const parsed = Date.parse(hasZone ? deviceIso : `${deviceIso}Z`);
  if (Number.isNaN(parsed)) return null;
  const epoch = hasZone ? parsed : parsed - tzOffsetMinutes * 60_000;
  return epoch - localNow.getTime();
}

/** т. 20: в режим СУПТО няма демо/тестови драйвери. null = конфигурацията е допустима. */
export function suptoConfigError(
  fiscal: { suptoMode: boolean; driver: string },
  terminal: { driver: string }
): string | null {
  if (!fiscal.suptoMode) return null;
  if (fiscal.driver === "demo") {
    return "В режим СУПТО демо драйверът за ФУ е забранен (Прил. № 29, т. 20). Изберете реално фискално устройство.";
  }
  if (terminal.driver === "demo") {
    return "В режим СУПТО демо терминалът е забранен (Прил. № 29, т. 20). Изберете реален ПОС терминал или „без терминал“.";
  }
  return null;
}
