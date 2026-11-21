import { getTranslations } from 'next-intl/server';
import { Container } from '@/components/ui/Container';

// Правен текст в четим вид. Съдържанието НЕ се променя: абзаците са разделени
// с празен ред, а „Заглавие · текст“ в началото на абзац става подзаглавие.
// От подзаглавията се строи съдържание отляво (само ≥lg, залепено).
const LEAD = /^([^·\n]{2,56}?) · ([\s\S]+)$/;

export async function LegalDoc({ title, body }: { title: string; body: string }) {
  const t = await getTranslations('nav');
  const parts = body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .map((paragraph, index) => {
      const match = LEAD.exec(paragraph);
      return match
        ? { index, heading: match[1], text: match[2] }
        : { index, heading: null, text: paragraph };
    });
  const toc = parts.filter((part) => part.heading);

  return (
    <main id="main">
      <div className="border-b border-line bg-surface-2/50">
        <Container className="py-12 sm:py-16">
          <h1 className="max-w-3xl text-title text-fg">{title}</h1>
        </Container>
      </div>
      <Container className="grid gap-10 py-10 sm:py-14 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
        {toc.length > 2 ? (
          <nav
            aria-label={t('onThisPage')}
            className="hidden lg:block"
          >
            <div className="sticky top-[calc(var(--header-h)+2rem)] max-h-[calc(100vh-var(--header-h)-4rem)] overflow-y-auto pe-2">
              <p className="text-small font-semibold text-fg">{t('onThisPage')}</p>
              <ol className="mt-3 space-y-0.5 border-s border-line text-small">
                {toc.map((part) => (
                  <li key={part.index}>
                    <a
                      href={`#s-${part.index}`}
                      className="focus-ring -ms-px block rounded-sm border-s border-transparent py-1 ps-3 text-fg-muted transition-colors hover:border-accent hover:text-fg"
                    >
                      {part.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        ) : (
          <div className="hidden lg:block" />
        )}
        <article className="legal-doc max-w-prose space-y-7 text-[1.0625rem] text-fg-2">
          {parts.map((part) =>
            part.heading ? (
              <section key={part.index} id={`s-${part.index}`} className="scroll-mt-24">
                <h2 className="text-subheading text-fg">{part.heading}</h2>
                <p className="mt-2 whitespace-pre-line">{part.text}</p>
              </section>
            ) : (
              <p key={part.index} className="whitespace-pre-line">
                {part.text}
              </p>
            ),
          )}
        </article>
      </Container>
    </main>
  );
}
