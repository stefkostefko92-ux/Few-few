import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { PageHero, Prose } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, faqPageLd, howToLd, webPageLd, canonical } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { PrintButton } from "@/components/PrintButton";
import { ShareButton } from "@/components/ShareButton";
import { HelpfulWidget } from "@/components/HelpfulWidget";
import { getIllustrations } from "@/lib/howto-illustrations";
import { getGuideIndex } from "@/lib/howto-index";
import {
  CATEGORY_TOPIC_PAGES,
  categoryPath,
  categorySlug,
  formatBgDate,
  isoDay,
  parseTags,
  splitLead,
} from "@/lib/howto";
import { prevNext, relatedGuides } from "@/lib/related";

export const dynamic = "force-dynamic";

const getFaq = cache(async (slug: string) =>
  prisma.faq.findFirst({ where: { slug, published: true } }),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [faq, index] = await Promise.all([getFaq(slug), getGuideIndex()]);
  const target = index.redirects.get(slug);
  if (target) permanentRedirect(`/kak-da/${target}`);
  if (!faq) return buildMetadata({ title: "Не е намерено", noindex: true });
  const lead = splitLead(faq.answer)?.lead ?? faq.answer;
  return buildMetadata({
    title: faq.seoTitle || faq.question,
    description: faq.seoDescription || plainText(lead, 155),
    path: `/kak-da/${faq.slug}`,
    type: "article",
    keywords: [
      faq.question.replace(/[?]$/, ""),
      ...parseTags(faq.tags).slice(0, 4),
      faq.category,
      "Как да",
      "стъпка по стъпка",
      "Бобов дол",
    ],
  });
}

export default async function FaqPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [faq, index] = await Promise.all([getFaq(slug), getGuideIndex()]);
  // Дословен дубъл на друго ръководство → постоянно към едното (308).
  const target = index.redirects.get(slug);
  if (target) permanentRedirect(`/kak-da/${target}`);
  if (!faq) notFound();

  // Брояч на прегледи — тихо и с директен UPDATE, за да НЕ мести updatedAt
  // (@updatedAt се сменя при всеки prisma update). Така датата на последна
  // редакция остава истинска — за sitemap и за хората.
  prisma.$executeRaw`UPDATE "Faq" SET "views" = "views" + 1 WHERE "id" = ${faq.id}`.catch(
    () => {},
  );

  const steps = faq.steps
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const links = faq.relatedLinks
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [label, url] = l.split("|").map((x) => x.trim());
      return { label: label || url, url };
    })
    .filter((l) => l.url);
  const tags = parseTags(faq.tags);
  const split = splitLead(faq.answer);
  const restMd = split ? split.rest : faq.answer;
  const localNote = faq.localNote.trim();
  const reviewed = faq.reviewedAt;

  const illustrations = getIllustrations(faq.slug);

  const catSlug = categorySlug(faq.category);
  const category = index.categoryBySlug.get(catSlug);
  const current = index.bySlug.get(faq.slug) ?? {
    id: faq.id,
    slug: faq.slug,
    question: faq.question,
    category: faq.category,
    tags: faq.tags,
    order: faq.order,
  };
  const related = relatedGuides(current, index.guides);
  const { prev, next } = category ? prevNext(current, category.items) : { prev: null, next: null };
  const topic = CATEGORY_TOPIC_PAGES[faq.category];
  const path = `/kak-da/${faq.slug}`;

  return (
    <>
      {/* Свързваме страницата в графа (WebPage) и избираме ЕДИН основен тип:
          HowTo при наличие на стъпки, иначе FAQPage — без застъпване. Датата
          на проверка влиза само ако човек реално е проверил (reviewedAt). */}
      <JsonLd
        data={[
          webPageLd({
            name: faq.question,
            description: plainText(split?.lead ?? faq.answer, 160),
            path,
            ...(reviewed ? { lastReviewed: isoDay(reviewed) } : {}),
          }),
          steps.length > 0
            ? howToLd({
                name: faq.question,
                description: plainText(faq.answer, 200),
                steps,
                url: canonical(path),
                ...(reviewed ? { reviewedAt: isoDay(reviewed) } : {}),
              })
            : faqPageLd([
                { question: faq.question, answerText: plainText(faq.answer, 600) },
              ]),
        ]}
      />
      <PageHero
        title={faq.question}
        crumbs={[
          { name: "Как да…", path: "/kak-da" },
          ...(category ? [{ name: category.name, path: categoryPath(category.slug) }] : []),
          { name: faq.question, path },
        ]}
      />
      <article className="container-content grid gap-8 py-10 lg:grid-cols-[1fr,18rem]">
        <div>
          {split && (
            <div className="rounded-xl border-l-4 border-gold-400 bg-gold-50 p-5">
              <p className="text-sm font-bold uppercase tracking-wide text-slate-700">Накратко</p>
              <div
                className="prose-content mt-1 text-lg font-semibold leading-relaxed text-slate-900"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(split.lead) }}
              />
            </div>
          )}
          {reviewed && (
            <p className="mt-3 text-base text-slate-600">
              Проверено на <time dateTime={isoDay(reviewed)}>{formatBgDate(reviewed)}</time>
            </p>
          )}

          {localNote && (
            <section
              aria-labelledby="v-bobov-dol"
              className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-5"
            >
              <h2 id="v-bobov-dol" className="text-xl font-bold text-slate-900">
                В Бобов дол:
              </h2>
              <div
                className="prose-content mt-2 text-slate-800"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(localNote) }}
              />
            </section>
          )}

          {restMd.trim() && (
            <div className={split || localNote ? "mt-6" : ""}>
              <Prose html={renderMarkdown(restMd)} />
            </div>
          )}

          {illustrations.length > 0 && (
            <figure className="mt-8">
              <figcaption className="text-xl font-bold text-slate-900">
                Как изглежда на телефона
              </figcaption>
              <div className="mt-3 flex flex-wrap gap-5">
                {illustrations.map((img) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={img.src}
                    src={img.src}
                    alt={img.alt}
                    width={390}
                    height={720}
                    loading="lazy"
                    className="w-full max-w-[300px] rounded-2xl border border-slate-200 shadow-sm"
                  />
                ))}
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Примерна снимка за онагледяване. Реалният екран може да изглежда
                малко по-различно според телефона и версията на приложението.
              </p>
            </figure>
          )}

          {steps.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-bold text-slate-900">Стъпки</h2>
              <ol className="mt-3 space-y-3">
                {steps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-700 text-sm font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-slate-700">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {links.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-bold text-slate-900">Полезни връзки</h2>
              <ul className="mt-3 space-y-2">
                {links.map((l) => (
                  <li key={l.url}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-700 underline hover:decoration-2"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8 space-y-4 border-t border-slate-200 pt-5">
            <HelpfulWidget />
            <div className="flex flex-wrap items-start gap-3">
              <ShareButton
                title={faq.question}
                text={`${faq.question} — обяснено стъпка по стъпка`}
                path={path}
              />
              <PrintButton variant="secondary" label="Принтирай това обяснение" />
            </div>
          </div>

          {related.length > 0 && (
            <section aria-labelledby="srodni" className="no-print mt-10">
              <h2 id="srodni" className="section-title">
                Сродни ръководства
              </h2>
              <ul className="mt-5 grid gap-3 md:grid-cols-2">
                {related.map((g) => (
                  <li key={g.id}>
                    <Link
                      href={`/kak-da/${g.slug}`}
                      className="card flex min-h-[44px] items-center text-base font-semibold text-slate-900"
                    >
                      {g.question}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(prev || next) && category && (
            <nav
              aria-label={`Още в темата „${category.name}“`}
              className="no-print mt-8 grid gap-3 sm:grid-cols-2"
            >
              {prev ? (
                <Link href={`/kak-da/${prev.slug}`} rel="prev" className="btn-secondary justify-start text-left">
                  <span aria-hidden>←</span>
                  <span>
                    <span className="block text-sm font-normal text-slate-600">Предишно</span>
                    {prev.question}
                  </span>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link href={`/kak-da/${next.slug}`} rel="next" className="btn-secondary justify-end text-right">
                  <span>
                    <span className="block text-sm font-normal text-slate-600">Следващо</span>
                    {next.question}
                  </span>
                  <span aria-hidden>→</span>
                </Link>
              )}
            </nav>
          )}
        </div>

        <aside className="space-y-4 no-print">
          <div className="card bg-brand-50">
            <h2 className="text-base font-semibold text-slate-900">
              Нужна ви е още помощ?
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              Питайте дигиталния помощник долу вдясно или ни пишете — безплатно.
            </p>
            <Link href="/kontakti" className="btn-primary mt-3 w-full">
              Свържете се с нас
            </Link>
          </div>
          {category && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-base font-semibold text-slate-900">Тема</h2>
              <Link
                href={categoryPath(category.slug)}
                className="mt-1 flex min-h-[44px] items-center font-semibold text-brand-700 underline hover:decoration-2"
              >
                {category.name} ({category.count})
              </Link>
              {topic && (
                <Link
                  href={topic.href}
                  className="flex min-h-[44px] items-center text-brand-700 underline hover:decoration-2"
                >
                  Вижте и: {topic.label}
                </Link>
              )}
            </div>
          )}
          {tags.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-slate-900">Етикети</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {tags.map((t) => (
                  <li key={t}>
                    <Link
                      href={`/kak-da?tag=${encodeURIComponent(t)}`}
                      className="badge a11y-btn px-3 hover:underline"
                    >
                      #{t}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </article>
    </>
  );
}
