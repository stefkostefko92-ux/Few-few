import { safeJsonLd } from "@/lib/jsonld";

// Вгражда структурирани данни (JSON-LD) в страницата. Сериализира се през
// safeJsonLd, защото част от данните може да съдържат потребителски текст.
export function JsonLd({ data }: { data: unknown | unknown[] }) {
  const items = Array.isArray(data) ? data : [data];
  return (
    <>
      {items.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(item) }}
        />
      ))}
    </>
  );
}
