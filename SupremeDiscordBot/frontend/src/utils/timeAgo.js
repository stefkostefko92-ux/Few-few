// frontend/src/utils/timeAgo.js
// „преди 2 мин“ / „2m ago“ — относителното време от концепцията на таблото,
// на езика на потребителя (Intl.RelativeTimeFormat, без библиотека).
const UNITS = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function timeAgo(date, lang = "en", now = Date.now()) {
  const ts = new Date(date).getTime();
  if (!Number.isFinite(ts)) return "—";
  const diff = Math.round((ts - now) / 1000); // отрицателно = в миналото
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto", style: "short" });
  for (const [unit, sec] of UNITS) {
    if (Math.abs(diff) >= sec) return rtf.format(Math.round(diff / sec), unit);
  }
  return rtf.format(0, "minute");
}
