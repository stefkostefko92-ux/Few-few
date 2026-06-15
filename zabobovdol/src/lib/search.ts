import { prisma } from "@/lib/prisma";
import { plainText } from "@/lib/markdown";

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
  "ли", "кой", "коя", "кое", "кога", "къде", "що", "що-то", "the", "to",
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

// Построява OR условие: всеки токен срещу всяко от полетата.
function orFor(fields: string[], tokens: string[]) {
  const conds: Record<string, unknown>[] = [];
  for (const t of tokens) {
    for (const f of fields) {
      conds.push({ [f]: { contains: t, mode: "insensitive" } });
    }
  }
  return conds;
}

function countMatches(text: string, tokens: string[]): number {
  const lc = text.toLowerCase();
  return tokens.reduce((n, t) => (lc.includes(t) ? n + 1 : n), 0);
}

// Обединено търсене по думи в основните типове съдържание.
export async function search(query: string, limit = 12): Promise<SearchResult[]> {
  const tokens = tokenize(query);
  // Резервен вариант: ако всичко е изчистено (напр. само стоп-думи),
  // ползваме оригиналната заявка като един токен.
  const terms = tokens.length ? tokens : [query.trim().toLowerCase()].filter((t) => t.length >= 2);
  if (terms.length === 0) return [];

  const [faqs, services, businesses, events] = await Promise.all([
    prisma.faq.findMany({
      where: { published: true, OR: orFor(["question", "answer", "tags", "category"], terms) },
      take: limit * 2,
    }),
    prisma.service.findMany({
      where: { published: true, OR: orFor(["name", "description", "address"], terms) },
      take: limit * 2,
    }),
    prisma.business.findMany({
      where: { published: true, OR: orFor(["name", "description"], terms) },
      take: limit * 2,
    }),
    prisma.event.findMany({
      where: {
        published: true,
        startAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) },
        OR: orFor(["title", "description"], terms),
      },
      take: limit * 2,
    }),
  ]);

  const results: SearchResult[] = [
    ...faqs.map((f) => ({
      type: "faq" as const,
      title: f.question,
      snippet: plainText(f.answer, 140),
      url: `/kak-da/${f.slug}`,
      score: countMatches(f.question, terms) * 2 + countMatches(f.answer, terms) + 0.5,
    })),
    ...services.map((s) => ({
      type: "service" as const,
      title: s.name,
      snippet: plainText(s.description || s.address, 140),
      url: `/uslugi/${s.slug}`,
      score: countMatches(s.name, terms) * 2 + countMatches(s.description, terms),
    })),
    ...businesses.map((b) => ({
      type: "business" as const,
      title: b.name,
      snippet: plainText(b.description, 140),
      url: `/biznes/${b.slug}`,
      score: countMatches(b.name, terms) * 2 + countMatches(b.description, terms),
    })),
    ...events.map((e) => ({
      type: "event" as const,
      title: e.title,
      snippet: plainText(e.description, 140),
      url: `/sabitiya/${e.slug}`,
      score: countMatches(e.title, terms) * 2 + countMatches(e.description, terms),
    })),
  ];

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
