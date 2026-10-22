// Оттеглени ръководства „Как да…“ — дубли на друго ръководство на същата тема
// (същото заглавие, почти същият текст). Google вижда два адреса с едно и също
// съдържание и разделя сигналите им, затова оставяме ЕДНО канонично ръководство:
//  • старият адрес води с 301 към каноничния (src/middleware.ts);
//  • не влиза в sitemap.xml (src/app/sitemap.ts);
//  • сийдовете вече не го създават, а заварената база го скрива с миграцията
//    prisma/migrations/20261022120000_seo_retire_duplicates_placeholders.
// Правило: остава първоначалното, по-пълно ръководство; оттегля се по-късното
// копие от пакета seed-c-*.ts. Ключ = оттегленият slug, стойност = каноничният.
export const RETIRED_GUIDES: Readonly<Record<string, string>> = Object.freeze({
  "z-televiziya-online2": "fun-tv-online",
  "c-proverya-globi-kat": "docs-kat-globi",
  "m-falshiva-banknota2": "money-falshiva-banknota",
  "c-zdravno-dosie2": "docs-zdravno-dosie",
  "c-elektronna-recepta2": "docs-elektronna-recepta",
});

export const RETIRED_GUIDE_SLUGS: readonly string[] = Object.freeze(
  Object.keys(RETIRED_GUIDES),
);

// Каноничният slug за оттеглено ръководство, иначе null.
export function retiredGuideTarget(slug: string): string | null {
  return Object.prototype.hasOwnProperty.call(RETIRED_GUIDES, slug)
    ? RETIRED_GUIDES[slug]
    : null;
}
