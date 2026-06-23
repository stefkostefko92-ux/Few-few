import { safeJsonLd } from "@/lib/jsonld";

// Вгражда структурирани данни (JSON-LD) в страницата. Стойностите идват от
// собствените ни строители, но част от тях може да съдържат потребителски текст
// (напр. заглавие на одобрена обява), затова сериализираме през safeJsonLd.
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
