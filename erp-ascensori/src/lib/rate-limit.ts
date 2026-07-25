// Ограничение на честотата (sliding window, в паметта на процеса).
// Достатъчно за една инсталация; при клъстер се изнася в Redis.

interface Finestra {
  count: number;
  resetAt: number;
}

const finestre = new Map<string, Finestra>();

/** Връща true, ако заявката Е позволена; false при надвишена честота. */
export function consenti(chiave: string, limite: number, finestraMs: number): boolean {
  const ora = Date.now();
  const f = finestre.get(chiave);
  if (!f || f.resetAt <= ora) {
    finestre.set(chiave, { count: 1, resetAt: ora + finestraMs });
    return true;
  }
  if (f.count >= limite) return false;
  f.count += 1;
  return true;
}

// Периодично чистене, за да не расте паметта.
const PULIZIA_MS = 10 * 60_000;
let ultimaPulizia = Date.now();
export function puliziaSeNecessaria(): void {
  const ora = Date.now();
  if (ora - ultimaPulizia < PULIZIA_MS) return;
  ultimaPulizia = ora;
  for (const [k, f] of finestre) if (f.resetAt <= ora) finestre.delete(k);
}
