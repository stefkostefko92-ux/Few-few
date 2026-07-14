// Споделени статистически помощници за анализните двигатели.
//
// Тук живее ЕДИНСТВЕНАТА реализация на median/percentile/robustZ, за да не се
// дублира между `analyze.js` и `forensics.js`. Поведението е ТОЧНО както преди
// изнасянето (byte-for-byte резултат) — това е чист DRY рефактор, без промяна на
// нито едно число.

/** Медиана на масив от числа (празен → null). */
export function median(arr) {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// TODO(off-by-one): текущата percentile семантика е НЕСТАНДАРТНА — индексът е
// `floor((p/100) * n)` вместо класическото `(p/100) * (n-1)` (или интерполация).
// Затова напр. P90(1..10) връща 10 вместо ~9.1. Поведението е ЗАМРАЗЕНО (launch
// данните зависят от него); поправката е отделна координирана стъпка след пуска.
/** „Персентил" по текущата (нестандартна) семантика. */
export function percentile(arr, p) {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[i];
}

/** Robust z-score чрез медиана и MAD (устойчив на екстремни стойности). */
export function robustZ(v, med, mad) {
  if (v == null || med == null || !mad) return null;
  return (v - med) / (1.4826 * mad);
}
