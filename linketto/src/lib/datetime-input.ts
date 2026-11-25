// Стойности за <input type="datetime-local"> — без зависимости (ползва се и в клиента).

/** ISO момент → „YYYY-MM-DDTHH:mm“ в UTC — стойност за datetime-local без JS (tz е празно → UTC). */
export function utcInputValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 16);
}
