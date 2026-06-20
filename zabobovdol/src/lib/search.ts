import { prisma } from "@/lib/prisma";
import { plainText } from "@/lib/markdown";
import { SERVICE_CATEGORY_LABELS, BUSINESS_CATEGORY_LABELS } from "@/lib/categories";

export type SearchResult = {
  type: "faq" | "service" | "business" | "event";
  title: string;
  snippet: string;
  url: string;
  score: number;
};

// Често срещани думи, които не помагат за търсене.
const STOP = new Set([
  "как", "да", "за", "на", "в", "и", "или", "се", "си", "ми", "е",
  "ли", "кой", "коя", "кое", "кога", "къде", "що", "the", "to", "от",
]);

function tokenize(q: string): string[] {
  return Array.from(
    new Set(
      q
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= 2 && !STOP.has(t)),
    ),
  ).slice(0, 6);
}

// Леко „стемване" за български — за да намира и при членуване и множествено
// число (напр. „аптеки" → намира „аптека"; „зъболекари" → „зъболекар").
function variants(term: string): string[] {
  const v = new Set([term]);
  if (term.length >= 5) v.add(term.slice(0, -1));
  if (term.length >= 6) v.add(term.slice(0, -2));
  return [...v];
}

// Колко от думите (терминатите) се срещат в текста. Сравнението е изцяло в
// кода (toLowerCase в JS сгъва правилно кирилицата — независимо от базата).
function matchedCount(haystack: string, termVariants: string[][]): number {
  const lc = haystack.toLowerCase();
  let n = 0;
  for (const vs of termVariants) {
    if (vs.some((v) => lc.includes(v))) n += 1;
  }
  return n;
}

// Лек кеш на индекса в паметта (за да не сканираме базата при всяко търсене).
type Index = {
  faqs: { slug: string; question: string; answer: string; tags: string; category: string }[];
  services: {
    slug: string; name: string; description: string; address: string;
    phone: string; phone2: string; category: string;
  }[];
  businesses: { slug: string; name: string; description: string; category: string }[];
  events: { slug: string; title: string; description: string; location: string }[];
};
let cache: { at: number; idx: Index } | null = null;
const TTL_MS = 60_000;

async function loadIndex(): Promise<Index> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.idx;
  const [faqs, services, businesses, events] = await Promise.all([
    prisma.faq.findMany({
      where: { published: true },
      select: { slug: true, question: true, answer: true, tags: true, category: true },
    }),
    prisma.service.findMany({
      where: { published: true },
      select: {
        slug: true, name: true, description: true, address: true,
        phone: true, phone2: true, category: true,
      },
    }),
    prisma.business.findMany({
      where: { published: true },
      select: { slug: true, name: true, description: true, category: true },
    }),
    prisma.event.findMany({
      where: {
        published: true,
        startAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) },
      },
      select: { slug: true, title: true, description: true, location: true },
    }),
  ]);
  cache = { at: Date.now(), idx: { faqs, services, businesses, events } };
  return cache.idx;
}

// Обединено търсене по думи в основните типове съдържание.
export async function search(query: string, limit = 12): Promise<SearchResult[]> {
  const tokens = tokenize(query);
  const terms = tokens.length
    ? tokens
    : [query.trim().toLowerCase()].filter((t) => t.length >= 2);
  if (terms.length === 0) return [];
  const T = terms.map(variants);

  const idx = await loadIndex();
  const results: SearchResult[] = [];

  for (const f of idx.faqs) {
    const head = `${f.question} ${f.tags} ${f.category}`;
    const score = matchedCount(head, T) * 3 + matchedCount(f.answer, T);
    if (score > 0) {
      results.push({
        type: "faq",
        title: f.question,
        snippet: plainText(f.answer, 140),
        url: `/kak-da/${f.slug}`,
        score,
      });
    }
  }

  for (const s of idx.services) {
    const catLabel = SERVICE_CATEGORY_LABELS[s.category] ?? "";
    const head = `${s.name} ${catLabel} ${s.phone} ${s.phone2}`;
    const score = matchedCount(head, T) * 3 + matchedCount(`${s.description} ${s.address}`, T);
    if (score > 0) {
      results.push({
        type: "service",
        title: s.name,
        snippet: plainText(s.description || s.address, 140),
        url: `/uslugi/${s.slug}`,
        score,
      });
    }
  }

  for (const b of idx.businesses) {
    const catLabel = BUSINESS_CATEGORY_LABELS[b.category] ?? "";
    const head = `${b.name} ${catLabel}`;
    const score = matchedCount(head, T) * 3 + matchedCount(b.description, T);
    if (score > 0) {
      results.push({
        type: "business",
        title: b.name,
        snippet: plainText(b.description, 140),
        url: `/biznes/${b.slug}`,
        score,
      });
    }
  }

  for (const e of idx.events) {
    const head = `${e.title} ${e.location}`;
    const score = matchedCount(head, T) * 3 + matchedCount(e.description, T);
    if (score > 0) {
      results.push({
        type: "event",
        title: e.title,
        snippet: plainText(e.description, 140),
        url: `/sabitiya/${e.slug}`,
        score,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// Записва запитване без резултат, за да виждаме какво търсят хората.
export async function recordMiss(query: string): Promise<void> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return;
  try {
    const existing = await prisma.searchMiss.findFirst({ where: { query: q } });
    if (existing) {
      await prisma.searchMiss.update({
        where: { id: existing.id },
        data: { count: { increment: 1 }, resolved: false },
      });
    } else {
      await prisma.searchMiss.create({ data: { query: q } });
    }
  } catch (err) {
    console.error("Грешка при запис на търсене без резултат:", err);
  }
}
