/**
 * Сравнение на две ревизии на един документ (§4.1 „confronto tra revisioni“) — чисти функции без
 * база: разлики в метаданните, в приложимостта (вкл. табло), в текста по страници (редова разлика
 * по LCS) и в компонентите. Таван на работата: страница с твърде много редове се отбелязва като
 * „променена“ без редове, вместо да блокира сървъра.
 */

export type LineOp = '=' | '-' | '+';
export interface DiffLine {
  op: LineOp;
  text: string;
}

/** Таван на клетките на LCS таблицата за една страница (редове A × редове B). */
const MAX_CELLS = 400_000;
/** Колко реда от една разлика най-много връщаме (непроменените около промените се свиват). */
const MAX_LINES_PER_PAGE = 400;

export function splitLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Редова разлика (LCS). null → над тавана (само „променена“). */
export function lineDiff(a: readonly string[], b: readonly string[]): DiffLine[] | null {
  const n = a.length;
  const m = b.length;
  if ((n + 1) * (m + 1) > MAX_CELLS) return null;
  // lcs[i][j] = дължината на LCS на a[i:] и b[j:] (плоска таблица).
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i * w + j] =
        a[i] === b[j]
          ? (lcs[(i + 1) * w + j + 1] ?? 0) + 1
          : Math.max(lcs[(i + 1) * w + j] ?? 0, lcs[i * w + j + 1] ?? 0);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: '=', text: a[i] ?? '' });
      i += 1;
      j += 1;
    } else if ((lcs[(i + 1) * w + j] ?? 0) >= (lcs[i * w + j + 1] ?? 0)) {
      out.push({ op: '-', text: a[i] ?? '' });
      i += 1;
    } else {
      out.push({ op: '+', text: b[j] ?? '' });
      j += 1;
    }
  }
  for (; i < n; i += 1) out.push({ op: '-', text: a[i] ?? '' });
  for (; j < m; j += 1) out.push({ op: '+', text: b[j] ?? '' });
  return out.slice(0, MAX_LINES_PER_PAGE);
}

export interface PageText {
  page: number;
  text: string;
}

export interface PageDiff {
  page: number;
  status: 'same' | 'changed' | 'added' | 'removed';
  /** Само за променените: редовете (null — над тавана). */
  lines?: DiffLine[] | null;
}

/** Страниците на двете ревизии една до друга: еднакви/променени/само в A (removed)/само в B (added). */
export function pageDiffs(a: readonly PageText[], b: readonly PageText[]): PageDiff[] {
  const byA = new Map(a.map((p) => [p.page, p.text]));
  const byB = new Map(b.map((p) => [p.page, p.text]));
  const pages = [...new Set([...byA.keys(), ...byB.keys()])].sort((x, y) => x - y);
  return pages.map((page) => {
    const ta = byA.get(page);
    const tb = byB.get(page);
    if (ta === undefined)
      return { page, status: 'added', lines: lineDiff([], splitLines(tb ?? '')) };
    if (tb === undefined) return { page, status: 'removed', lines: lineDiff(splitLines(ta), []) };
    const la = splitLines(ta);
    const lb = splitLines(tb);
    if (la.length === lb.length && la.every((l, i) => l === lb[i])) return { page, status: 'same' };
    return { page, status: 'changed', lines: lineDiff(la, lb) };
  });
}

/** Множества: само в A, само в B, и в двете (подредени — стабилен изход). */
export function setDiff(a: Iterable<string>, b: Iterable<string>) {
  const sa = new Set(a);
  const sb = new Set(b);
  const sort = (xs: string[]) => xs.sort((x, y) => x.localeCompare(y));
  return {
    onlyA: sort([...sa].filter((x) => !sb.has(x))),
    onlyB: sort([...sb].filter((x) => !sa.has(x))),
    both: sort([...sa].filter((x) => sb.has(x))),
  };
}

/** Полетата с различна стойност (датите — като ISO низ). */
export function fieldDiffs<T extends Record<string, unknown>>(
  a: T,
  b: T,
  fields: ReadonlyArray<keyof T & string>,
): Array<{ field: string; a: unknown; b: unknown }> {
  const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : (v ?? null));
  return fields
    .filter((f) => JSON.stringify(norm(a[f])) !== JSON.stringify(norm(b[f])))
    .map((f) => ({ field: f, a: norm(a[f]), b: norm(b[f]) }));
}

/** Едно правило за приложимост като стабилен ключ за сравнение (модел/HW/FW/табло). */
export function ruleKey(r: {
  productModel: string;
  hwRevision: string | null;
  fwMin: string | null;
  fwMax: string | null;
  allFirmware: boolean;
  deviceSerial: string | null;
}): string {
  const fw = r.allFirmware ? 'FW *' : `FW ${r.fwMin ?? ''}–${r.fwMax ?? ''}`;
  return [r.productModel, `HW ${r.hwRevision ?? '*'}`, fw, `SN ${r.deviceSerial ?? '*'}`].join(
    ' · ',
  );
}
