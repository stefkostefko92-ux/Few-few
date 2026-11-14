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
  if (fiscal.driver === "datecs-lan") {
    return "В режим СУПТО експерименталният драйвер Datecs LAN е забранен. За Datecs изберете моста ErpNet.FP.";
  }
  return null;
}

/**
 * Цялост на компилацията (т. 4), както я е проверил Electron преди старта на сървъра:
 * `verified` — подписът и всички хешове съвпадат; `unsigned` — опакована компилация без подпис,
 * без публичен ключ или production сървър, пуснат без Electron; `tampered` — Electron не пуска
 * сървъра, но ако все пак тече, нищо не се продава; `dev` — разработка (NODE_ENV не е
 * production). Непозната стойност → `unsigned`.
 */
export type IntegrityState = "verified" | "unsigned" | "tampered" | "dev";

export function integrityState(env: string | undefined, nodeEnv: string | undefined = process.env.NODE_ENV): IntegrityState {
  // „dev“ само извън production: сървър, пуснат директно (без проверката на Electron), не е
  // разработка — той е непроверена компилация и в режим СУПТО не продава (fail closed).
  if (env === undefined || env === "") return nodeEnv === "production" ? "unsigned" : "dev";
  return env === "verified" || env === "tampered" || env === "unsigned" ? env : "unsigned";
}

/**
 * Режим СУПТО спира откриването и плащането, ако компилацията не е подписана (т. 4) или часът на
 * ФУ не е сверен през последните 24 часа (т. 5). null = продажбата може да продължи.
 */
export function suptoSaleBlock(o: {
  suptoMode: boolean;
  integrity: IntegrityState;
  clockSyncedAt: string | null;
  now: Date;
}): string | null {
  if (!o.suptoMode) return null;
  if (o.integrity === "tampered") {
    return "Файловете на програмата са променени след подписа — продажбите са спрени (Прил. № 29, т. 4). Преинсталирайте от официалния инсталатор.";
  }
  if (o.integrity === "unsigned") {
    return "Компилацията не е подписана от производителя — в режим СУПТО продажбите са спрени (Прил. № 29, т. 4).";
  }
  if (!isLinkFresh(o.clockSyncedAt, o.now, CLOCK_SYNC_MAX_AGE_MS)) {
    return "Часът не е сверен с фискалното устройство през последните 24 часа (Прил. № 29, т. 5). Проверете връзката с ФУ — драйверът трябва да връща часа му.";
  }
  return null;
}
