/**
 * Текущите версии на правните текстове (собственикът, 10 ноември 2026 — „Fai tutto in modo tale da essere
 * legalmente coperti e minimamente esposti“). Текстът на всяка версия е файл в `legale/` и не се пипа
 * никога: нов текст = нов файл с нова версия тук, и всички го приемат наново (тестът пази хеша на всяка
 * версия). Чисто, без база.
 */

export type TipoTesto = 'CONDIZIONI' | 'REGOLE';

/** Условията за услугата (договорът с фирмата) и правилата за ползване (за всеки човек). */
export const VERSIONE: Readonly<Record<TipoTesto, string>> = {
  CONDIZIONI: '2026-11-10',
  REGOLE: '2026-11-10',
};

/** Денят на последната версия на двата текста — за sitemap и JSON-LD на `/condizioni`. */
export const TESTI_AGGIORNATI: string = [VERSIONE.CONDIZIONI, VERSIONE.REGOLE].sort().at(-1) ?? '';

/** Колко години се пазят доказателствата (приемания и изтеглени изчисления) след събитието. */
export const ANNI_CONSERVAZIONE = 10;
