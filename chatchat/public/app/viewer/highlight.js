// Позиции на цитираните компоненти (клеми, релета) от текстовия слой на pdf.js.
// Позицията е приблизителна по знаци вътре в текстовия фрагмент (шрифтът не е моноширинен) —
// маркировката е рамка около мястото, не точна геометрия; няма текстов слой → няма позиция, само списък.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Идентификаторът както е в базата („X3“, „K-1“) → шаблон, който не хваща „X30“ или „AX3“. */
function refPattern(ref) {
  const body = [...ref.replace(/\s+/g, '')]
    .map((ch) => (ch === '-' ? '[-\\s]?' : escapeRe(ch)))
    .join('');
  return new RegExp(`(?<![A-Za-z0-9])${body}(?![A-Za-z0-9])`, 'gi');
}

/**
 * Намира всички срещания на `refs` в текстовите фрагменти на страницата.
 * → { rects: [{ ref, x, y, w, h, angle }] (в координатите на viewport-а), found: Set<ref> }
 */
export function locateRefs(items, viewport, Util, refs) {
  const rects = [];
  const found = new Set();
  const patterns = refs.map((ref) => [ref, refPattern(ref)]);
  for (const item of items) {
    const str = typeof item.str === 'string' ? item.str : '';
    if (!str || !item.transform) continue;
    const tr = Util.transform(viewport.transform, item.transform);
    const fontH = Math.hypot(tr[2], tr[3]);
    const lenW = item.width * viewport.scale;
    const angle = Math.atan2(tr[1], tr[0]);
    for (const [ref, re] of patterns) {
      re.lastIndex = 0;
      for (const m of str.matchAll(re)) {
        const from = (m.index / str.length) * lenW;
        const w = (m[0].length / str.length) * lenW;
        // Начало на фрагмента (долу вляво, върху базовата линия); ъгълът е около тази точка.
        rects.push({
          ref,
          x: tr[4] + from * Math.cos(angle),
          y: tr[5] + from * Math.sin(angle),
          w,
          h: fontH,
          angle,
        });
        found.add(ref);
      }
    }
  }
  return { rects, found };
}

/** Кои компоненти да се търсят на страницата: от цитираните парчета + онези, чийто текст е в цитата. */
export function citedComponentRefs(chunks, evidenceOnPage) {
  const cited = new Set(evidenceOnPage.map((e) => e.chunkId).filter(Boolean));
  const quoteText = evidenceOnPage.map((e) => String(e.quote ?? '')).join('\n');
  const out = new Map();
  for (const c of chunks) {
    const refs = Array.isArray(c.componentRefs) ? c.componentRefs : [];
    for (const ref of refs) {
      if (typeof ref !== 'string' || ref === '') continue;
      if (cited.has(c.id) || refPattern(ref).test(quoteText)) out.set(ref.toUpperCase(), ref);
    }
  }
  return [...out.values()];
}
