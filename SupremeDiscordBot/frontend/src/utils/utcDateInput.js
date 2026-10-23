// frontend/src/utils/utcDateInput.js
// <input type="datetime-local"> не носи часова зона: стойността „YYYY-MM-DDTHH:MM“
// се тълкува от `new Date(...)` като ЛОКАЛНО време на браузъра. Полетата, които
// обявяваме като UTC (сезоните в админ конзолата), минават през тези две функции,
// така че показаното и записаното да са едно и също UTC време, независимо от
// зоната на оператора. (Дефект, хванат при одита на 19.09.2026.)

/** ISO/Date → стойност за datetime-local в UTC („2026-09-21T00:00“). */
export function toUtcInput(d) {
  if (!d) return "";
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? "" : t.toISOString().slice(0, 16);
}

/** Стойност от datetime-local, четена като UTC → ISO низ; невалидно → undefined. */
export function fromUtcInput(s) {
  if (!s) return undefined;
  const iso = s.length === 16 ? `${s}:00Z` : s.endsWith("Z") ? s : `${s}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
