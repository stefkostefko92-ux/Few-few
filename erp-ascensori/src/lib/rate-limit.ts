// Ограничение на честотата (fixed window, в паметта на процеса).
// Достатъчно за една инсталация; при клъстер се изнася в Redis.
// ВНИМАНИЕ: при няколко процеса всеки има свой брояч → ефективният лимит
// се умножава по броя процеси. Виж SECURITY.md.

interface Finestra {
  count: number;
  resetAt: number;
}

const finestre = new Map<string, Finestra>();

/** Чете положително число от средата; при нечислова стойност пада на подразбиране.
 *  Без това `Number("venti")` дава NaN, а `count >= NaN` е винаги false —
 *  тоест печатна грешка в конфигурацията ИЗКЛЮЧВА ограничението мълчаливо. */
function numero(v: string | undefined, predefinito: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : predefinito;
}

/** Праговете са конфигурируеми, за да могат тестовете да ги вдигат. */
export const LIMITI = {
  login: numero(process.env.RATE_LIMIT_LOGIN, 20),
  refresh: numero(process.env.RATE_LIMIT_REFRESH, 60),
  finestraMs: numero(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60_000),
};

/** Само за тестове: нулира всички прозорци (иначе редът на тестовете влияе). */
export function azzeraPerTest(): void {
  finestre.clear();
}

/**
 * Таван на броя ключове в паметта.
 *
 * Ключът идва и от ВХОДА (имейл при вход, хеш на токен при подновяване):
 * поток от измислени имейли иначе расте Map-а без край — отказ на услуга по
 * памет. При пълна таблица първо се чистят изтеклите; ако пак е пълна, НОВ
 * ключ се ОТКАЗВА (fail closed). Изхвърлянето на най-стария би било по-лошо:
 * атакуващият запълва таблицата и така НУЛИРА брояча на жертвата.
 */
export const MAX_CHIAVI = numero(process.env.RATE_LIMIT_MAX_CHIAVI, 100_000);

function spazioPerNuova(ora: number): boolean {
  if (finestre.size < MAX_CHIAVI) return true;
  for (const [k, f] of finestre) if (f.resetAt <= ora) finestre.delete(k);
  return finestre.size < MAX_CHIAVI;
}

/** Връща true, ако заявката Е позволена; false при надвишена честота. */
export function consenti(
  chiave: string,
  limite: number,
  finestraMs: number,
): boolean {
  const ora = Date.now();
  const f = finestre.get(chiave);
  if (!f || f.resetAt <= ora) {
    if (!f && !spazioPerNuova(ora)) return false;
    finestre.set(chiave, { count: 1, resetAt: ora + finestraMs });
    return true;
  }
  if (f.count >= limite) return false;
  f.count += 1;
  return true;
}

/**
 * Брои събитие и връща поредния му номер в прозореца (1, 2, …).
 *
 * За неуспехи, при които няма ред в базата — непознат имейл при вход. Там
 * броячът в паметта ИМИТИРА блокадата на истинския акаунт, за да не издава
 * отговорът кой имейл съществува. Пълна таблица връща `Infinity`: отказ.
 */
export function incrementa(chiave: string, finestraMs: number): number {
  const ora = Date.now();
  const f = finestre.get(chiave);
  if (!f || f.resetAt <= ora) {
    if (!f && !spazioPerNuova(ora)) return Number.POSITIVE_INFINITY;
    finestre.set(chiave, { count: 1, resetAt: ora + finestraMs });
    return 1;
  }
  f.count += 1;
  return f.count;
}

/** Колко събития има в прозореца, без да брои ново. */
export function conteggio(chiave: string): number {
  const f = finestre.get(chiave);
  return f && f.resetAt > Date.now() ? f.count : 0;
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
