/** Renders one or more JSON-LD documents into the page head/body (§15). */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const docs = Array.isArray(data) ? data : [data];
  return (
    <>
      {docs.map((doc, i) => (
        <script
          key={i}
          type="application/ld+json"
          // JSON.stringify output is safe to inline; no user input is included.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(doc) }}
        />
      ))}
    </>
  );
}
