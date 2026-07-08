// Видими „чести въпроси“ за инструментна страница. Съдържанието трябва да
// съвпада с FAQPage структурираните данни (виж toolJsonLd) — затова двете
// ползват един и същ масив, подаван от страницата.

export interface Faq {
  q: string;
  a: string;
}

export default function ToolFaq({ items, heading = "Чести въпроси" }: { items: Faq[]; heading?: string }) {
  if (!items.length) return null;
  return (
    <section className="no-print mx-auto mt-14 max-w-3xl">
      <h2 className="font-display text-2xl font-bold">{heading}</h2>
      <div className="mt-5 space-y-3">
        {items.map((f) => (
          <details key={f.q} className="card-warm group p-5 open:shadow-lift">
            <summary className="cursor-pointer list-none font-semibold marker:hidden">
              <span className="mr-2 inline-block text-tera transition group-open:rotate-90">▸</span>
              {f.q}
            </summary>
            <p className="mt-2 pl-6 text-ink-soft">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
