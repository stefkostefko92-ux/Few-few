/**
 * Новините на продукта (собственикът, 14.11.2026: „при ъпдейт … popup като в rilievi на първото влизане на всеки
 * user след дадения ъпдейт … страница, която описва какво сме правили, без нещата, които хората не ги
 * интересуват“). ЕДИНСТВЕНИЯТ списък: страницата „Какво ново“, емисията, sitemap и прозорецът в
 * приложението идват оттук. Текстовете — `locales/<език>/news.json` (`news.entries.<id>`), тестът пази
 * двете страни. Нова новина = ред НАЙ-ОТГОРЕ + текстовете ѝ; id-то не се сменя никога (котва на
 * страницата, ред в таблицата `NewsEntry`). Само неща, които хората виждат и ползват — без вътрешни
 * поправки; `planned` функции не влизат (src/features.ts). Чисто, без база.
 */
export interface NewsEntry {
  /** `<ден>-<дума>`: котвата на страницата и ключът в речника. */
  id: string;
  /** Денят на новината (YYYY-MM-DD). */
  date: string;
}

/** Най-новите отгоре; в един ден — по важност. */
export const NEWS: readonly NewsEntry[] = [
  { id: '2026-11-14-versiya-1-0', date: '2026-11-14' },
  { id: '2026-11-14-tarsene', date: '2026-11-14' },
  { id: '2026-11-14-dnevnik', date: '2026-11-14' },
  { id: '2026-11-14-avans', date: '2026-11-14' },
  { id: '2026-11-14-prekratyavane', date: '2026-11-14' },
  { id: '2026-11-13-proforma', date: '2026-11-13' },
  { id: '2026-11-13-povtaryashti', date: '2026-11-13' },
  { id: '2026-11-13-banka', date: '2026-11-13' },
  { id: '2026-11-13-vhodyashti', date: '2026-11-13' },
  { id: '2026-11-13-ezik', date: '2026-11-13' },
  { id: '2026-11-13-api', date: '2026-11-13' },
  { id: '2026-11-13-prilozhenie', date: '2026-11-13' },
  { id: '2026-11-12-e-fakturi', date: '2026-11-12' },
  { id: '2026-11-12-shkafche', date: '2026-11-12' },
  { id: '2026-11-12-kantori', date: '2026-11-12' },
];

/** Денят на последната новина — „Последно обновяване“, `lastmod` и `dateModified`. */
export const LAST_UPDATE: string = NEWS[0]?.date ?? '2026-11-14';

/** Колко новини най-много в прозореца; другите — „и още N“ с връзка към страницата. */
export const MAX_POPUP = 6;

/** Началото на деня (UTC). */
export function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * Новините, които още нямат ред в `NewsEntry`, и кога са излезли. Празна таблица — нова инсталация (или
 * база за тестове): всяка в своя ден (не по-късно от днес), защото няма обновяване, за което да се каже.
 * Иначе — сега: сървър, който за пръв път тръгва с нея, е самото обновяване.
 */
export function toRegister(
  existing: ReadonlySet<string>,
  now: Date,
  entries: readonly NewsEntry[] = NEWS,
): Array<{ id: string; publishedAt: Date }> {
  const fresh = existing.size === 0;
  const today = dayStart(now.toISOString().slice(0, 10)).getTime();
  return entries
    .filter((entry) => !existing.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      publishedAt: fresh ? new Date(Math.min(dayStart(entry.date).getTime(), today)) : now,
    }));
}

/**
 * Новините за прозореца: излезли след `readAt` (последното „Разбрах“ на човека), най-новите първи, в един
 * момент — по реда на списъка. Ред в таблицата за махната новина не се показва.
 */
export function unread(
  published: ReadonlyMap<string, Date>,
  readAt: Date,
  entries: readonly NewsEntry[] = NEWS,
): NewsEntry[] {
  return entries
    .map((entry, order) => ({ entry, order, at: published.get(entry.id) }))
    .filter(
      (x): x is { entry: NewsEntry; order: number; at: Date } =>
        x.at !== undefined && x.at.getTime() > readAt.getTime(),
    )
    .sort((x, y) => y.at.getTime() - x.at.getTime() || x.order - y.order)
    .map((x) => x.entry);
}

/** Новините по дни за страницата — от най-новия ден; в деня — по реда на списъка. */
export function byDay(
  entries: readonly NewsEntry[] = NEWS,
): Array<{ date: string; entries: NewsEntry[] }> {
  const days: Array<{ date: string; entries: NewsEntry[] }> = [];
  for (const entry of entries) {
    const last = days.at(-1);
    if (last && last.date === entry.date) last.entries.push(entry);
    else days.push({ date: entry.date, entries: [entry] });
  }
  return days;
}
