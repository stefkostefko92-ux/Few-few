// Показването на сумите и имената на /prozrachnost — един вид навсякъде.
// Данните идват като текст от СИГМА („4 млн. €“, „16,2%“, "\"ГРОМА ХОЛД\" ЕООД").
const NBSP = " ";

/**
 * „4 млн. €“ → „4,0 млн. €“ — милионите винаги с един знак (за да се сравняват
 * в колона: 4,1 / 4,0 / 1,9); хилядите — цели. Интервалите — неразделящи.
 */
export function amountText(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  const m = /^(\d+)(?:[,.](\d+))?\s*(млн\.|хил\.|млрд\.)\s*€$/.exec(s);
  if (!m) return s.replace(/ €$/, `${NBSP}€`);
  if (m[3] === "хил." && !m[2]) return `${m[1]}${NBSP}${m[3]}${NBSP}€`;
  const dec = (m[2] ?? "0").slice(0, 1);
  return `${m[1]},${dec}${NBSP}${m[3]}${NBSP}€`;
}

/** „16,2%“ → 16.2 (за лентата на дела); неразбираемо → null. */
export function shareNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /^(\d+(?:[,.]\d+)?)\s*%$/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/** Правите кавички в имената на фирмите → български „…“. */
export function bgQuotes(name: string): string {
  return name.replace(/"([^"]+)"/g, "„$1“");
}
