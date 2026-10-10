// backend/src/lib/safeLogUrl.js
// Адресът, който влиза в access лога. За архивите — БЕЗ query: `?t=` е
// токенът, който сам по себе си отваря транскрипта, а логът се чете от повече
// хора и живее по-дълго от линка (Кодаджията, 10.10.2026). Другите адреси
// остават цели — query-то им помага при разследване и не носи тайна.
const ARCHIVE = /^\/(archive|api\/tickets\/archives)(\/|\?|$)/;

export function safeLogUrl(url) {
  const u = String(url || "");
  return ARCHIVE.test(u) ? u.split("?")[0] : u;
}
