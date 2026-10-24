import Link from "next/link";
import type { Metadata } from "next";
import {
  CalendarClock,
  ChevronDown,
  Coins,
  Euro,
  Landmark,
  type LucideIcon,
} from "@/components/icons";
import { prisma } from "@/lib/prisma";
import {
  ArticleActions,
  EmptyState,
  Notice,
  PageHero,
  PageMeta,
  Prose,
  SectionHeader,
  StepList,
} from "@/components/ui";
import { buildMetadata, faqPageLd } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { JsonLd } from "@/components/JsonLd";
import { EuroConverter } from "@/components/EuroConverter";
import { PrintSourceLine } from "@/components/PrintSourceLine";
import { OpenDetailsOnPrint } from "@/components/OpenDetailsOnPrint";
import { getIllustrations } from "@/lib/howto-illustrations";
import { EURO_TOPIC, euroTodayNote } from "@/lib/howto-euro";
import { EuroTodayNotice, EuroWrittenBeforeNotice } from "@/components/EuroNotice";
import { SECTION } from "@/lib/section-names";

export const dynamic = "force-dynamic";

const CATEGORY = EURO_TOPIC;

/**
 * Кога за последно е преглеждан текстът на страницата (фактите, увода,
 * картинките) — НЕ отговорите от базата. Сменете датата при следваща редакция.
 */
const FACTS_UPDATED = "2026-10-24";
const SOURCES = ["БНБ", "evroto.bg", "КЗП"];

// Нагледни помагала (стилизирани примерни изображения). Картинката „Първите
// седмици — и левове, и евро“ е махната: говори за изтекъл период като за
// предстоящ.
const EURO_VISUALS: { src: string; alt: string; caption: string }[] = [
  {
    src: "/kak-da/euro-rate.png",
    alt: "Фиксиран курс 1 евро = 1,95583 лева",
    caption: "Фиксиран курс",
  },
  {
    src: "/kak-da/euro-banknotes.png",
    alt: "Евробанкноти по цвят и номинал",
    caption: "Банкнотите (примерни)",
  },
  {
    src: "/kak-da/euro-coins.png",
    alt: "Евромонети от 1 цент до 2 евро",
    caption: "Монетите",
  },
  {
    src: "/kak-da/euro-atm.png",
    alt: "Банкомат, който дава евро",
    caption: "Банкоматът дава евро",
  },
  {
    src: "/kak-da/euro-dual-price.png",
    alt: "Ценоразпис с цена в лева и в евро",
    caption: "Двойните цени (до 8 август 2026 г.)",
  },
];

export const metadata: Metadata = buildMetadata({
  title: "Всичко за еврото в България — 35 въпроса и отговори",
  description:
    "Ясно и просто за еврото в България: курс 1 евро = 1,95583 лева, къде да обмените левове сега (в БНБ — безплатно и без срок), цени, пенсии, банкови сметки и как да се пазите от измами.",
  path: "/evroto",
  keywords: [
    "еврото в България",
    "курс лев евро 1,95583",
    "обмяна на левове в евро",
    "пенсии в евро",
    "измами с еврото",
    "Бобов дол",
    "Carbon Stealth",
  ],
});

// Какво важи ДНЕС (октомври 2026 г.) — в минало и сегашно време.
const FACTS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: CalendarClock,
    title: "Валута",
    text: "От 1\u00a0януари 2026\u00a0г. еврото е валутата на България.",
  },
  {
    icon: Euro,
    title: "Курс",
    text: "Фиксиран: 1 евро = 1,95583 лева — за всичко.",
  },
  {
    icon: Coins,
    title: "Левове в брой",
    text: "Не се приемат за плащане от 1\u00a0февруари 2026\u00a0г.",
  },
  {
    icon: Landmark,
    title: "Обмяна",
    text: "В БНБ — безплатно и без срок. Безплатната обмяна в банки и пощи приключи на 30\u00a0юни 2026\u00a0г.",
  },
];

// Въпросите по групи — най-отгоре това, което е актуално сега (обмяна в БНБ,
// курс, сметки и пенсии). Отговорите с изтекли срокове (EURO_TODAY) са в
// края на групата си. Непознат въпрос от базата отива в „Други въпроси“.
const GROUPS: { id: string; title: string; slugs: string[] }[] = [
  {
    id: "obmyana",
    title: "Обмяна на левове и курс",
    slugs: [
      "e-bnb-bezsrochno",
      "e-kurs",
      "e-gruba-smetka",
      "e-kak-presmiatam",
      "e-gubia-li-pari",
      "e-leva-vkashti",
      "e-obmiana-bezplatno",
      "e-da-barzam-li",
      "e-kolko-struva",
    ],
  },
  {
    id: "smetki",
    title: "Сметки, пенсии и заплати",
    slugs: [
      "e-pensiya",
      "e-smetki-banka",
      "e-iban",
      "e-vlog",
      "e-kredit",
      "e-zaplata",
      "e-karta-raboti",
      "e-bankomat-evro",
      "e-online-bankirane",
      "e-vaucheri",
    ],
  },
  {
    id: "ceni",
    title: "Цени",
    slugs: ["e-zakraglyane", "e-poskapvane", "e-dvoyni-ceni-ot-koga", "e-zashto-dve-ceni"],
  },
  {
    id: "pari",
    title: "Банкноти и монети",
    slugs: ["e-banknoti", "e-moneti", "e-stotinki", "e-bg-moneti", "e-falshivo-evro"],
  },
  {
    id: "izmami",
    title: "Измами",
    slugs: ["e-izmami-vnimanie", "e-izmama-telefon"],
  },
  {
    id: "smyanata",
    title: "Как мина смяната",
    slugs: ["e-koga-evro", "e-zashto", "e-leva-do-koga", "e-resto", "e-oficialna-info"],
  },
];

/**
 * Колко отговора са отворени при зареждане (останалите — с едно натискане).
 * Отговор с изтекъл срок не се отваря сам.
 */
const OPEN_FIRST = 5;

type FaqRow = Awaited<ReturnType<typeof loadFaq>>[number];

function loadFaq() {
  return prisma.faq.findMany({
    where: { published: true, category: CATEGORY },
    orderBy: { order: "asc" },
  });
}

function groupFaq(items: FaqRow[]) {
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const used = new Set<string>();
  const groups: { id: string; title: string; items: FaqRow[] }[] = [];
  for (const g of GROUPS) {
    const list = g.slugs.flatMap((s) => {
      const it = bySlug.get(s);
      if (!it || used.has(s)) return [];
      used.add(s);
      return [it];
    });
    if (list.length) groups.push({ id: g.id, title: g.title, items: list });
  }
  const rest = items.filter((i) => !used.has(i.slug));
  if (rest.length) groups.push({ id: "drugi", title: "Други въпроси", items: rest });
  return groups;
}

export default async function EuroPage() {
  const items = await loadFaq();
  const groups = groupFaq(items);
  // Всяка картинка — само веднъж на страницата (курсът беше показан 3 пъти).
  const shownImages = new Set(EURO_VISUALS.map((v) => v.src));
  let n = 0;
  let opened = 0;

  return (
    <>
      {items.length > 0 && (
        <JsonLd
          data={faqPageLd(
            items.map((i) => ({
              question: i.question,
              answerText: plainText(i.answer, 1500),
            })),
            "/evroto",
          )}
        />
      )}

      <PageHero
        eyebrow={SECTION.money}
        title="Всичко за еврото — въпроси и отговори"
        intro="Просто и спокойно за еврото: какво стана с парите, пенсиите и цените, къде да обмените левове сега и как да се пазите от измами. Информацията е по официални източници."
        crumbs={[{ name: "Еврото", path: "/evroto" }]}
        meta={<PageMeta updated={FACTS_UPDATED} sources={SOURCES} />}
      />

      <div className="container-content space-y-12 py-10">
        {/* AEO: прекият отговор най-отпред, като проза (query fan-out). */}
        <p className="max-w-3xl text-lg leading-relaxed text-slate-800">
          Еврото е валутата на България от <strong>1&nbsp;януари 2026&nbsp;г.</strong> Курсът е
          фиксиран завинаги: <strong>1 евро = 1,95583 лева</strong>. От{" "}
          <strong>1&nbsp;февруари 2026&nbsp;г.</strong> с левове в брой не се плаща. Безплатната
          обмяна в банки и пощи приключи на 30&nbsp;юни 2026&nbsp;г.; в <strong>БНБ</strong> левовете
          се обменят <strong>безплатно и без срок</strong>. До 31&nbsp;декември 2026&nbsp;г. банките
          също обменят левове, но може да искат такса.
        </p>

        {/* Какво важи днес */}
        <section aria-labelledby="dnes">
          <h2 id="dnes" className="sr-only">
            Какво важи днес
          </h2>
          <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FACTS.map((f) => {
              const Icon = f.icon;
              return (
                <li key={f.title} className="panel h-full">
                  <span className="icon-chip-sm">
                    <Icon aria-hidden />
                  </span>
                  <h3 className="h-card mt-3">{f.title}</h3>
                  <p className="mt-1 text-base text-slate-700">{f.text}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <EuroConverter className="max-w-3xl" />

        {/* Предупреждение за измами */}
        <Notice
          tone="danger"
          titleAs="h2"
          title="Внимавайте с измамите около еврото"
          className="max-w-3xl"
        >
          <p>
            Никой от банка или държава НЕ идва вкъщи и НЕ звъни по телефона да „обменя“ или
            „проверява“ левовете ви. Това е измама. Обмяната става само на гише (БНБ, банка, поща).
            При такъв човек — затворете вратата или телефона и звъннете на близък. Вижте и{" "}
            <Link href="/izmami" className="link">
              „Пази се от измами“
            </Link>
            .
          </p>
        </Notice>

        {/* Въпроси и отговори */}
        <section aria-labelledby="vaprosi">
          <SectionHeader id="vaprosi" title="Често задавани въпроси" />
          {items.length === 0 ? (
            <EmptyState title="Скоро тук ще добавим въпросите за еврото." />
          ) : (
            <div className="max-w-3xl space-y-8">
              <EuroWrittenBeforeNotice onEuroPage />

              <nav aria-labelledby="sadarzhanie" className="panel">
                <h3 id="sadarzhanie" className="label-caps">
                  Съдържание
                </h3>
                <ul role="list" className="mt-2 grid gap-x-6 sm:grid-cols-2">
                  {groups.map((g) => (
                    <li key={g.id}>
                      <a
                        href={`#${g.id}`}
                        className="link-quiet flex min-h-tap items-center text-base font-medium text-brand-700"
                      >
                        {g.title} ({g.items.length})
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>

              {groups.map((g) => (
                <section key={g.id} id={g.id} aria-labelledby={`${g.id}-zaglavie`}>
                  <h3 id={`${g.id}-zaglavie`} className="text-2xl font-bold text-slate-900">
                    {g.title}
                  </h3>
                  <div className="mt-4 space-y-3">
                    {g.items.map((i) => {
                      n += 1;
                      const stale = euroTodayNote(i.slug) !== null;
                      const open = !stale && opened < OPEN_FIRST;
                      if (open) opened += 1;
                      const pics = getIllustrations(i.slug).filter((img) => {
                        if (shownImages.has(img.src)) return false;
                        shownImages.add(img.src);
                        return true;
                      });
                      const steps = i.steps
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean);
                      return (
                        <details
                          key={i.id}
                          id={i.slug}
                          open={open}
                          className="panel group p-0"
                        >
                          <summary className="flex min-h-[3.5rem] cursor-pointer list-none items-center gap-3 rounded-2xl px-5 py-3 [&::-webkit-details-marker]:hidden">
                            <span className="min-w-0 flex-1 font-sans text-lg font-semibold text-slate-900">
                              <span className="text-brand-700">{n}.</span> {i.question}
                            </span>
                            <ChevronDown
                              className="h-6 w-6 shrink-0 text-brand-700 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                              aria-hidden
                            />
                          </summary>
                          <div className="border-t border-slate-200 px-5 pb-5 pt-3">
                            <div
                              className={
                                pics.length
                                  ? "sm:grid sm:grid-cols-[minmax(0,1fr),12rem] sm:gap-6"
                                  : ""
                              }
                            >
                              <div className="min-w-0">
                                <EuroTodayNotice slug={i.slug} className="mb-4 rounded-xl" />
                                <Prose html={renderMarkdown(i.answer)} />
                                {steps.length > 0 && <StepList steps={steps} className="mt-4" />}
                              </div>
                              {pics.map((img) => (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  key={img.src}
                                  src={img.src}
                                  alt={img.alt}
                                  width={390}
                                  height={720}
                                  loading="lazy"
                                  className="mx-auto mt-4 w-full max-w-[12rem] rounded-2xl border border-slate-200 shadow-sm sm:mt-0 print:max-w-[45mm]"
                                />
                              ))}
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        {/* Нагледни помагала — как изглеждат еврото и цените */}
        <section aria-labelledby="kak-izglezhda">
          <SectionHeader id="kak-izglezhda" title="Как изглеждат еврото и цените" />
          <ul role="list" className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
            {EURO_VISUALS.map((v) => (
              <li key={v.src}>
                <figure className="text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={v.src}
                    alt={v.alt}
                    width={390}
                    height={720}
                    loading="lazy"
                    className="mx-auto w-full max-w-[200px] rounded-2xl border border-slate-200 shadow-sm"
                  />
                  <figcaption className="mt-2 text-base font-medium text-slate-700">
                    {v.caption}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-base text-slate-600">
            Изображенията са примерни, за онагледяване. Банкнотите са показани по цвят и номинал, не
            като точни копия.
          </p>
        </section>

        <div className="max-w-3xl space-y-6">
          <section aria-labelledby="iztochnici" className="panel">
            <h2 id="iztochnici" className="font-sans text-xl font-semibold text-slate-900">
              Официални източници (за проверка)
            </h2>
            <ul role="list" className="mt-2 space-y-1 text-base text-slate-700">
              <li>
                Българска народна банка —{" "}
                <a
                  href="https://www.bnb.bg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  bnb.bg
                </a>
              </li>
              <li>
                Официален портал за еврото —{" "}
                <a
                  href="https://evroto.bg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  evroto.bg
                </a>
              </li>
              <li>
                Комисия за защита на потребителите —{" "}
                <a href="https://kzp.bg" target="_blank" rel="noopener noreferrer" className="link">
                  kzp.bg
                </a>
              </li>
            </ul>
            <p className="mt-3 text-base text-slate-600">
              За конкретни въпроси за вашата сметка питайте във вашата банка.
            </p>
          </section>

          <ArticleActions
            className="!mt-0"
            shareTitle="Всичко за еврото — За Бобов дол"
            shareText="Еврото в България — просто и спокойно: курс, обмяна на левове, пенсии и измами."
            sharePath="/evroto"
          />
          <PrintSourceLine path="/evroto" />
          <OpenDetailsOnPrint />
        </div>
      </div>
    </>
  );
}
