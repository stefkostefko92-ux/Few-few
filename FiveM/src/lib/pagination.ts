/**
 * Страниране на каталога — ЧИСТО (тествано).
 *
 * Защо изобщо. Каталогът показваше първите 200 сървъра на една страница от
 * 1,1 MB HTML, а останалите 838 нямаха нито един вътрешен линк: стигаха до
 * търсачката само през sitemap-а и до посетителя — само през търсачката на
 * сайта. Страниците (`?page=2`) дават път до ВСЕКИ сървър и олекотяват HTML-а.
 */

/** Сървъри на страница — дели се на 2 и на 3 (колоните на решетката). */
export const PAGE_SIZE = 48;

/** `?page=` от URL — само цяло положително число; всичко друго е първа страница. */
export function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{1,4}$/.test(value)) return 1;
  const page = Number(value);
  return page >= 1 ? page : 1;
}

export type Page<T> = {
  items: T[];
  page: number;
  pages: number;
  /** Колко елемента има ПРЕДИ тази страница — за позициите в ItemList. */
  offset: number;
  /** Поисканата страница е след последната — викащият връща 404. */
  outOfRange: boolean;
};

export function paginate<T>(all: readonly T[], page: number, size = PAGE_SIZE): Page<T> {
  const pages = Math.max(1, Math.ceil(all.length / size));
  const outOfRange = page > pages;
  const current = Math.min(Math.max(1, page), pages);
  const offset = (current - 1) * size;
  return { items: all.slice(offset, offset + size), page: current, pages, offset, outOfRange };
}

/**
 * Номерата, които се показват: първа, последна и съседите на текущата, с
 * `null` за пропуск („…“). Петнайсет страници в ред не се събират на телефон.
 */
export function pageWindow(page: number, pages: number): Array<number | null> {
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: Array<number | null> = [];
  for (const n of sorted) {
    const prev = out[out.length - 1];
    if (typeof prev === 'number' && n - prev > 1) out.push(null);
    out.push(n);
  }
  return out;
}

/** Адрес на страница N: първата е БЕЗ `?page=1` — един адрес за едно съдържание. */
export function pageHref(base: string, page: number, params: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  if (page > 1) query.set('page', String(page));
  const text = query.toString();
  return text ? `${base}?${text}` : base;
}
