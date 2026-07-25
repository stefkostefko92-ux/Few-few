// Ограничение на честотата (fixed window, в паметта на процеса).
// Достатъчно за една инсталация; при клъстер се изнася в Redis.
// ВНИМАНИЕ: при няколко процеса всеки има свой брояч → ефективният лимит
// се умножава по броя процеси. Виж SECURITY.md.

interface Finestra {
  count: number;
  resetAt: number;
}

const finestre = new Map<string, Finestra>();

/** Праговете са конфигурируеми, за да могат тестовете да ги вдигат. */
export const LIMITI = {
  login: Number(process.env.RATE_LIMIT_LOGIN ?? 20),
  refresh: Number(process.env.RATE_LIMIT_REFRESH ?? 60),
  finestraMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60_000),
};

/** Само за тестове: нулира всички прозорци (иначе редът на тестовете влияе). */
export function azzeraPerTest(): void {
  finestre.clear();
}

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
