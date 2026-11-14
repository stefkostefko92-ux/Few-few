import { catalogById, catalogParagraphs } from "@/lib/mcp/catalog";

/**
 * Видимо, сървърно рендирано обяснение на инструментна страница: стъпките
 * „Как се прави“ + „За инструмента“ (текстът от каталога).
 *
 * Защо съществува (GSC, 2026-10): 13 от 14-те инструментни страници бяха
 * „обходени/открити, но не индексирани“. Две причини в кода:
 *   1. HowTo стъпките стояха САМО в JSON-LD. Структурирани данни за съдържание,
 *      което човек не вижда на страницата, нарушават правилата на Google —
 *      затова ги рендираме тук от СЪЩИЯ обект `HOWTO`, който отива в JSON-LD.
 *   2. Уникалният текст на страница беше едно изречение + 3–4 въпроса; всичко
 *      останало е еднакъв за 14-те страници редактор. Каталогът носи вече
 *      проверено, конкретно описание (размери, режими, за кого е) — показваме
 *      него, без да измисляме нов текст.
 */
export default function ToolGuide({
  current,
  howTo,
}: {
  /** Пътят на страницата, напр. "/etiketi" (= id в каталога без наклонена черта). */
  current: string;
  howTo: { name: string; steps: string[] };
}) {
  const id = current.replace(/^\//, "");
  const entry = catalogById(id);
  const paragraphs = catalogParagraphs(id);

  return (
    <section className="no-print mx-auto mt-14 max-w-3xl" aria-labelledby={`kak-${id}`}>
      <h2 id={`kak-${id}`} className="font-display text-2xl font-bold">
        {howTo.name}
      </h2>
      <ol className="mt-4 list-decimal space-y-2 pl-6 text-ink-soft">
        {howTo.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>

      {entry && paragraphs.length ? (
        <>
          <h2 className="font-display mt-10 text-2xl font-bold">За инструмента „{entry.title}“</h2>
          <div className="mt-4 space-y-3 text-ink-soft">
            {paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
