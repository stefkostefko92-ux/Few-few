// „Сродни ръководства“ — детерминистично, без AI и без база: точки за обща
// тема, общи етикети и общи думи в заглавието. Еднакъв вход → еднакъв изход,
// за да не „мигат“ връзките между посещенията (и за ботовете).
import { categorySlug, parseTags, sortGuides, type GuideIndexItem } from "@/lib/howto";

export type RelatedCandidate = Pick<
  GuideIndexItem,
  "id" | "slug" | "question" | "category" | "tags" | "order"
>;

export const RELATED_MIN = 4;
export const RELATED_MAX = 6;

const W_CATEGORY = 3;
const W_TAG = 2;
const W_WORD = 1;
// От друга тема влиза само при поне общ етикет или две общи думи — една обща
// дума („телефон“) е твърде слаба връзка.
const MIN_CROSS_SCORE = 2;

// Служебни думи, които не казват нищо за темата.
const STOPWORDS = new Set([
  "как", "какво", "каква", "какви", "кога", "къде", "кой", "коя", "кое", "кои", "защо",
  "мога", "може", "трябва", "има", "няма", "ако", "или", "дали", "със", "към", "през",
  "след", "преди", "без", "при", "като", "това", "този", "тази", "тези", "мой", "моя",
  "моят", "моите", "свой", "своя", "своите", "нещо", "някой", "онлайн", "лесно", "сам",
  "сама", "сами", "правя", "направя", "ползвам", "използвам",
]);

const STEM = 5;

/** Думите от заглавието: малки букви, без служебни, със „стъбло“ от 5 букви. */
export function titleWords(question: string): Set<string> {
  const out = new Set<string>();
  for (const w of (question ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (w.length < 4 || STOPWORDS.has(w)) continue;
    // Грубо „стъбло“, за да се срещнат „пенсия“, „пенсията“ и „пенсии“.
    out.add(w.length > STEM ? w.slice(0, STEM) : w);
  }
  return out;
}

function tagSet(tags: string): Set<string> {
  return new Set(parseTags(tags).map((t) => t.toLowerCase()));
}

export function relatedScore(a: RelatedCandidate, b: RelatedCandidate): number {
  let score = categorySlug(a.category) === categorySlug(b.category) ? W_CATEGORY : 0;
  const ta = tagSet(a.tags);
  for (const t of tagSet(b.tags)) if (ta.has(t)) score += W_TAG;
  const wa = titleWords(a.question);
  for (const w of titleWords(b.question)) if (wa.has(w)) score += W_WORD;
  return score;
}

/**
 * До `max` (по подразбиране 6) сродни ръководства за `current` от `pool`.
 * Подредба: точки ↓, после своята тема, после `order` и slug — стабилно.
 * Ако подходящите са под `min`, допълва от своята тема по близост на `order`.
 */
export function relatedGuides<T extends RelatedCandidate>(
  current: RelatedCandidate,
  pool: T[],
  opts: { min?: number; max?: number } = {},
): T[] {
  const min = opts.min ?? RELATED_MIN;
  const max = opts.max ?? RELATED_MAX;
  const cat = categorySlug(current.category);

  const scored = pool
    .filter((p) => p.id !== current.id && p.slug !== current.slug)
    .map((p) => {
      const same = categorySlug(p.category) === cat;
      return { p, same, score: relatedScore(current, p) };
    })
    .filter((x) => (x.same ? x.score > W_CATEGORY : x.score >= MIN_CROSS_SCORE));

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.same) - Number(a.same) ||
      a.p.order - b.p.order ||
      a.p.slug.localeCompare(b.p.slug),
  );
  const picked = scored.slice(0, max).map((x) => x.p);

  if (picked.length < min) {
    const taken = new Set(picked.map((p) => p.id));
    const fill = pool
      .filter((p) => p.id !== current.id && !taken.has(p.id) && categorySlug(p.category) === cat)
      .sort(
        (a, b) =>
          Math.abs(a.order - current.order) - Math.abs(b.order - current.order) ||
          a.order - b.order ||
          a.slug.localeCompare(b.slug),
      );
    for (const p of fill) {
      if (picked.length >= min) break;
      picked.push(p);
    }
  }
  return picked;
}

/** Предишно/следващо ръководство в същата тема (по `order`, после slug). */
export function prevNext<T extends Pick<GuideIndexItem, "id" | "order" | "slug">>(
  current: Pick<GuideIndexItem, "id">,
  categoryItems: T[],
): { prev: T | null; next: T | null } {
  const sorted = sortGuides(categoryItems);
  const i = sorted.findIndex((x) => x.id === current.id);
  if (i < 0) return { prev: null, next: null };
  return { prev: sorted[i - 1] ?? null, next: sorted[i + 1] ?? null };
}
