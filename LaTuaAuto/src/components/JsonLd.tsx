// Единствената позволена употреба на dangerouslySetInnerHTML: JSON-LD, който
// ние генерираме (без потребителски вход). Escape-ваме „<“ за всеки случай.
export function JsonLd({ data }: { data: unknown }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
