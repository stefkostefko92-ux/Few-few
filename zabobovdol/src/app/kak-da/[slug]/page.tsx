import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { ArticleActions, PageHero, PageMeta, Prose, SectionHeader, StepList } from "@/components/ui";
import { ChevronDown, ExternalLink } from "@/components/icons";
import { JsonLd } from "@/components/JsonLd";
import { PrintSourceLine } from "@/components/PrintSourceLine";
import { buildMetadata, faqPageLd, howToLd, webPageLd, canonical } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { isoDate } from "@/lib/format-date";
import { STEP_LINKIFY } from "@/lib/linkify";
import { getIllustrations } from "@/lib/howto-illustrations";
import { getGuideIndex } from "@/lib/howto-index";
import { euroTodayNote, isEuroTopic } from "@/lib/howto-euro";
import { EuroTodayNotice, EuroWrittenBeforeNotice } from "@/components/EuroNotice";
import {
  canonicalCategory,
  categoryPath,
  categorySlug,
  parseTags,
  splitLead,
  topicPageFor,
  topicSectionOf,
} from "@/lib/howto";
import { prevNext, relatedGuides } from "@/lib/related";
import { GuideCard } from "../_components/GuideList";
import { Linkified, LocalNote } from "../_components/LocalNote";
import { SECTION } from "@/lib/section-names";

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
      canonicalCategory(faq.category),
      "Как да",
      "стъпка по стъпка",
      "Бобов дол",
      "Carbon Stealth",
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
  // reviewedAt е стенно време от админа (datetime-local) — показва се както е въведено.
  const reviewedIso = reviewed ? isoDate(reviewed, { wall: true }) : "";

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
  const { prev, next } = category ? prevNext(current, category.items) : { prev: null, next: null };
  // „Предишно/Следващо“ стоят отдолу — не ги повтаряме и в „Сродни“.
  const related = relatedGuides(
    current,
    index.guides.filter((g) => g.id !== prev?.id && g.id !== next?.id),
  );
  const topic = topicPageFor(faq.category);
  const section = topicSectionOf(faq.category);
  const path = `/kak-da/${faq.slug}`;
  // Темата „Еврото“ е писана преди 1.01.2026 — бележка най-отгоре: с „какво
  // важи днес“ при изтекъл срок, иначе общата (src/lib/howto-euro.ts).
  const euro = isEuroTopic(faq.category);
  const euroStale = euro && euroTodayNote(faq.slug) !== null;

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
            ...(reviewed ? { lastReviewed: reviewedIso } : {}),
          }),
          steps.length > 0
            ? howToLd({
                name: faq.question,
                description: plainText(faq.answer, 200),
                steps,
                url: canonical(path),
                ...(reviewed ? { reviewedAt: reviewedIso } : {}),
              })
            : faqPageLd([
                { question: faq.question, answerText: plainText(faq.answer, 600) },
              ]),
        ]}
      />
      <PageHero
        eyebrow={section?.title ?? SECTION.guides}
        title={faq.question}
        crumbs={[
          { name: "Как да…", path: "/kak-da" },
          ...(category ? [{ name: category.name, path: categoryPath(category.slug) }] : []),
          { name: faq.question, path },
        ]}
        meta={<PageMeta reviewed={reviewed} updated={faq.updatedAt} wall />}
      />
      <article className="container-content grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr),18rem]">
        <div className="min-w-0 max-w-3xl">
          {euroStale ? (
            <EuroTodayNotice slug={faq.slug} withLink className="mb-6" />
          ) : (
            euro && <EuroWrittenBeforeNotice className="mb-6" />
          )}
          {split && (
            <div className="callout-note">
              <p className="label-caps">Накратко</p>
              <div
                className="prose-content mt-1 text-lg font-semibold leading-relaxed text-slate-900"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(split.lead) }}
              />
            </div>
          )}

          {localNote && <LocalNote note={localNote} className={split ? "mt-6" : ""} />}

          {restMd.trim() && (
            <div className={split || localNote ? "mt-6" : ""}>
              <Prose html={renderMarkdown(restMd)} />
            </div>
          )}

          {/* Стъпките са главното; снимката на телефона само ги пояснява — на
              компютър е вдясно от тях, на телефон след тях. */}
          {(steps.length > 0 || illustrations.length > 0) && (
            <div
              className={`mt-10 gap-8 ${
                steps.length > 0 && illustrations.length > 0
                  ? "lg:grid lg:grid-cols-[minmax(0,1fr),13rem]"
                  : ""
              }`}
            >
              {steps.length > 0 && (
                <section aria-labelledby="stapki" className="min-w-0">
                  <h2 id="stapki" className="text-2xl font-bold text-slate-900">
                    Стъпки
                  </h2>
                  <StepList
                    steps={steps.map((t, i) => (
                      <Linkified key={i} text={t} options={STEP_LINKIFY} />
                    ))}
                    className="mt-4"
                  />
                </section>
              )}
              {illustrations.length > 0 && (
                <figure className={steps.length > 0 ? "mt-8 lg:mt-1" : ""}>
                  <figcaption className="font-sans text-lg font-semibold text-slate-900">
                    Как изглежда на телефона
                  </figcaption>
                  <div className="mt-3 flex flex-wrap justify-center gap-5 sm:justify-start lg:flex-col">
                    {illustrations.map((img) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={img.src}
                        src={img.src}
                        alt={img.alt}
                        width={390}
                        height={720}
                        loading="lazy"
                        className="w-full max-w-[240px] rounded-2xl border border-slate-200 shadow-sm print:max-w-[45mm]"
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-base text-slate-600">
                    Примерна снимка за онагледяване. Реалният екран може да изглежда
                    малко по-различно според телефона и версията на приложението.
                  </p>
                </figure>
              )}
            </div>
          )}

          {links.length > 0 && (
            <section aria-labelledby="vrazki" className="mt-10">
              <h2 id="vrazki" className="text-2xl font-bold text-slate-900">
                Полезни връзки
              </h2>
              <ul role="list" className="mt-3 space-y-1">
                {links.map((l) => (
                  <li key={l.url}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link inline-flex min-h-tap items-center gap-1.5 text-base [overflow-wrap:anywhere]"
                    >
                      {l.label}
                      <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="sr-only"> (отваря се в нов прозорец)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ArticleActions
            className="mt-10"
            shareTitle={faq.question}
            shareText={`${faq.question} — обяснено стъпка по стъпка`}
            sharePath={path}
          />
          <PrintSourceLine path={path} />

          {related.length > 0 && (
            <section aria-labelledby="srodni" className="no-print mt-12">
              <SectionHeader id="srodni" title="Сродни ръководства" />
              <ul role="list" className="grid gap-4 md:grid-cols-2">
                {related.map((g) => (
                  <li key={g.id}>
                    <GuideCard guide={g} as="h3" />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(prev || next) && category && (
            <nav
              aria-label={`Още в темата „${category.name}“`}
              className="no-print mt-8 grid gap-4 sm:grid-cols-2"
            >
              {prev ? (
                <Link
                  href={`/kak-da/${prev.slug}`}
                  rel="prev"
                  className="card group flex h-full items-center gap-3"
                >
                  <ChevronDown className="h-6 w-6 shrink-0 rotate-90 text-brand-600" aria-hidden />
                  <span className="min-w-0">
                    <span className="text-meta block">Предишно</span>
                    <span className="block font-semibold text-brand-800">{prev.question}</span>
                  </span>
                </Link>
              ) : (
                <span className="hidden sm:block" />
              )}
              {next && (
                <Link
                  href={`/kak-da/${next.slug}`}
                  rel="next"
                  className="card group flex h-full items-center gap-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-meta block">Следващо</span>
                    <span className="block font-semibold text-brand-800">{next.question}</span>
                  </span>
                  <ChevronDown className="h-6 w-6 shrink-0 -rotate-90 text-brand-600" aria-hidden />
                </Link>
              )}
            </nav>
          )}
        </div>

        <aside className="no-print space-y-4">
          <div className="callout-info">
            <h2 className="h-card">Нужна ви е още помощ?</h2>
            <p className="mt-1 text-base text-slate-700">
              Попитайте дигиталния помощник (бутона долу вдясно) или ни пишете — безплатно е.
            </p>
            <Link href="/kontakti" className="btn-primary mt-3 w-full">
              Свържете се с нас
            </Link>
          </div>
          {category && (
            <div className="panel">
              <h2 className="label-caps">Тема</h2>
              <Link
                href={categoryPath(category.slug)}
                className="link mt-1 flex min-h-tap items-center text-base"
              >
                {category.name} ({category.count})
              </Link>
              {topic && (
                <Link href={topic.href} className="link flex min-h-tap items-center text-base">
                  Вижте и „{topic.label}“
                </Link>
              )}
            </div>
          )}
          {tags.length > 0 && (
            <div className="panel">
              <h2 className="label-caps">Етикети</h2>
              <ul role="list" className="mt-3 flex flex-wrap gap-2">
                {tags.map((t) => (
                  <li key={t}>
                    <Link href={`/kak-da?tag=${encodeURIComponent(t)}`} className="chip">
                      {t}
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
