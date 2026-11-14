// Правен текст в четим вид. Съдържанието НЕ се променя: абзаците са разделени
// с празен ред, а „Заглавие · текст“ в началото на абзац става подзаглавие.
const LEAD = /^([^·\n]{2,56}?) · ([\s\S]+)$/;

export function LegalDoc({ title, body }: { title: string; body: string }) {
  const paragraphs = body.split(/\n{2,}/).map((part) => part.trim());
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <article className="rounded-3xl border border-slate-200 bg-white px-6 py-9 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_20px_50px_-30px_rgba(15,23,42,0.18)] sm:px-12 sm:py-12">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          {title}
        </h1>
        <div
          aria-hidden
          className="mt-4 h-1 w-14 rounded-full bg-gradient-to-r from-sky-500 to-violet-500"
        />
        <div className="legal-doc mt-8 space-y-6 text-[15.5px] text-slate-700">
          {paragraphs.map((paragraph, index) => {
            const match = LEAD.exec(paragraph);
            if (!match) {
              return (
                <p key={index} className="whitespace-pre-line">
                  {paragraph}
                </p>
              );
            }
            return (
              <section key={index}>
                <h2 className="text-base font-bold text-slate-900">
                  {match[1]}
                </h2>
                <p className="mt-1.5 whitespace-pre-line">{match[2]}</p>
              </section>
            );
          })}
        </div>
      </article>
    </main>
  );
}
