// Групиране на търсенията без резултат по „корен“ — за да виждат редакторите
// една нужда, а не десет изписвания („пенсия“, „пенсии“, „пенсията за“…).
// Чиста функция (без база) — тества се в __tests__/search-misses.test.ts.

export type MissRow = {
  id: string;
  query: string;
  count: number;
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type MissGroup = {
  key: string;
  main: MissRow; // най-търсеното изписване — то става въпрос на ръководството
  items: MissRow[];
  total: number;
  resolved: boolean; // всички изписвания са обработени
  firstAt: Date;
  lastAt: Date;
};

const STOP = new Set([
  "как", "да", "за", "на", "в", "във", "и", "или", "се", "си", "ми", "е", "ли",
  "кой", "коя", "кое", "кога", "къде", "що", "от", "по", "до", "с", "със",
  "има", "мога", "може", "искам", "трябва",
]);
const PLACEHOLDER_RX = /\[(?:адрес|имейл|IBAN|телефон|ЕГН|цифри)\]/giu;

/** Ключът на групата: значимите думи, съкратени до 5 знака, подредени. */
export function missKey(query: string): string {
  const words = query
    .toLowerCase()
    .replace(PLACEHOLDER_RX, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2 && !STOP.has(w))
    .map((w) => w.slice(0, 5));
  const uniq = [...new Set(words)].sort();
  return uniq.length ? uniq.join(" ") : query.trim().toLowerCase();
}

/** Групи, подредени: първо необработените, после по общ брой, после по-скорошните. */
export function groupMisses(rows: MissRow[]): MissGroup[] {
  const map = new Map<string, MissRow[]>();
  for (const r of rows) {
    const k = missKey(r.query);
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  const groups: MissGroup[] = [];
  for (const [key, items] of map) {
    items.sort((a, b) => b.count - a.count || b.updatedAt.getTime() - a.updatedAt.getTime());
    groups.push({
      key,
      main: items[0],
      items,
      total: items.reduce((a, r) => a + r.count, 0),
      resolved: items.every((r) => r.resolved),
      firstAt: new Date(Math.min(...items.map((r) => r.createdAt.getTime()))),
      lastAt: new Date(Math.max(...items.map((r) => r.updatedAt.getTime()))),
    });
  }
  groups.sort(
    (a, b) =>
      Number(a.resolved) - Number(b.resolved) ||
      b.total - a.total ||
      b.lastAt.getTime() - a.lastAt.getTime(),
  );
  return groups;
}

/** Въпросът за новото ръководство: първа главна буква, без служебните етикети. */
export function guideQuestion(query: string): string {
  const q = query.replace(PLACEHOLDER_RX, " ").replace(/\s+/g, " ").trim();
  if (!q) return "";
  const s = q.charAt(0).toLocaleUpperCase("bg-BG") + q.slice(1);
  return /[?？]$/.test(s) ? s : `${s}?`;
}
