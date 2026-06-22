// Ръководства „Как да…“ — пренесени 1:1 от референтния проект и адаптирани за
// Дупница. Самото съдържание е в guides.generated.ts (автоматично генериран от
// scripts/import-guides.mts). Тук са типът и помощните функции.

import { GUIDES, CATEGORY_ORDER } from "./guides.generated";

export type Guide = {
  slug: string;
  question: string;
  category: string;
  answer: string;
  steps: string[];
  tags: string;
  relatedLinks: string[];
  order: number;
};

export { GUIDES, CATEGORY_ORDER };

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export function guidesByCategory(): { category: string; guides: Guide[] }[] {
  const groups = new Map<string, Guide[]>();
  for (const g of GUIDES) {
    const arr = groups.get(g.category) ?? [];
    arr.push(g);
    groups.set(g.category, arr);
  }
  return CATEGORY_ORDER.filter((c) => groups.has(c)).map((category) => ({
    category,
    guides: (groups.get(category) ?? []).sort(
      (a, b) => a.order - b.order || a.slug.localeCompare(b.slug),
    ),
  }));
}

// Леко резюме за листинги/търсене (без Markdown маркъп).
export function guideSummary(g: Guide, max = 160): string {
  const t = g.answer
    .replace(/[#*>_`]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}
