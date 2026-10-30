import Link from "next/link";
import type { Metadata } from "next";
import { Coins, Flame, HeartPulse, Phone, Soup, type LucideIcon } from "@/components/icons";
import { prisma } from "@/lib/prisma";
import { ArticleActions, PageHero, SectionHeader } from "@/components/ui";
import { buildMetadata, faqPageLd } from "@/lib/seo";
import { plainText } from "@/lib/markdown";
import { JsonLd } from "@/components/JsonLd";
import { EuroConverter } from "@/components/EuroConverter";
import { PhoneButton } from "@/components/PhoneButton";
import { PrintSourceLine } from "@/components/PrintSourceLine";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { getGuideIndex } from "@/lib/howto-index";
import { categoryPath, categorySlug, guidesLabel } from "@/lib/howto";
import { GuideCard } from "@/app/kak-da/_components/GuideList";
import { SECTION } from "@/lib/section-names";

export const dynamic = "force-dynamic";

const GUIDE_CATEGORY = "Пенсии и социални помощи";
/** Колко ръководства от темата се показват тук. */
const GUIDES_SHOWN = 12;

// Институциите в „Към кого да се обърна“ — от „Услуги и телефони“ (с дата на
// проверка и източник). Ако някоя липсва в базата, просто не се показва.
const CONTACT_SLUGS = ["noi-kyustendil", "noi-ofis-dupnitsa", "dsp-bobov-dol"] as const;
const CONTACT_HINT: Record<(typeof CONTACT_SLUGS)[number], string> = {
  "noi-kyustendil": "Въпроси за пенсии и обезщетения (национален телефон).",
  "noi-ofis-dupnitsa": "Най-близкият офис на НОИ — отдел „Пенсии“.",
  "dsp-bobov-dol": "Помощ за отопление, социални помощи, личен асистент.",
};

export const metadata: Metadata = buildMetadata({
  title: "Пенсии и социални помощи — пенсии, помощ за отопление, ТЕЛК",
  description:
    "Ясно обяснено: как се получава пенсия, целева помощ за отопление, ТЕЛК, социален патронаж и важните телефони на НОИ и Социално подпомагане за хората в Бобов дол.",
  path: "/pomoshti",
  keywords: [
    "пенсии Бобов дол",
    "помощ за отопление",
    "ТЕЛК",
    "социално подпомагане Бобов дол",
    "НОИ телефон",
    "социален патронаж",
    "Carbon Stealth",
  ],
});

const TOPICS: { icon: LucideIcon; title: string; points: string[] }[] = [
  {
    icon: Coins,
    title: "Пенсии",
    points: [
      "Пенсиите се изплащат от НОИ — по банкова сметка или в брой чрез Български пощи.",
      "От 1 януари 2026 г. пенсиите са в евро: превалутирани по фиксирания курс, стойността им е запазена.",
      "Изплащането през пощата е обикновено между 7-о и 20-о число на месеца, по график.",
      "Ако се бавите да получите пенсия — питайте в пощенската станция или на телефона на НОИ по-долу.",
    ],
  },
  {
    icon: Flame,
    title: "Целева помощ за отопление",
    points: [
      "Държавата подпомага отоплението на хора с по-ниски доходи през зимния сезон.",
      "Кандидатства се обикновено от 1 юли до 31 октомври всяка година — проверявайте актуалния срок.",
      "Подава се молба-декларация в Дирекция „Социално подпомагане“; носете лична карта и документ за доходи.",
    ],
  },
  {
    icon: HeartPulse,
    title: "ТЕЛК (степен на увреждане)",
    points: [
      "ТЕЛК освидетелства здравословното състояние и определя степен на увреждане.",
      "Решението дава право на добавки, облекчения и социална подкрепа.",
      "Започва се с направление от личния лекар. Пазете копие от решението на сигурно място.",
    ],
  },
  {
    icon: Soup,
    title: "Социален патронаж и домашна грижа",
    points: [
      "Много общини предлагат топъл обяд по домовете и домашен помощник за възрастни и трудноподвижни хора.",
      "За да разберете условията и да се запишете, обадете се в общината или в Социално подпомагане.",
      "Вижте и разделите „Зов за помощ“ и „Доброволци“ за подкрепа от съседи.",
    ],
  },
];

export default async function AidPage() {
  const [index, contacts] = await Promise.all([
    getGuideIndex(),
    prisma.service.findMany({
      where: { published: true, slug: { in: [...CONTACT_SLUGS] } },
      select: {
        slug: true,
        name: true,
        phone: true,
        address: true,
        verifiedAt: true,
        verifiedSource: true,
      },
    }),
  ]);
  const contactsInOrder = CONTACT_SLUGS.flatMap((s) => contacts.filter((c) => c.slug === s));

  const topic = index.categoryBySlug.get(categorySlug(GUIDE_CATEGORY));
  const shown = topic ? topic.items.slice(0, GUIDES_SHOWN) : [];
  const rows = shown.length
    ? await prisma.faq.findMany({
        where: { id: { in: shown.map((g) => g.id) } },
        select: { id: true, answer: true, seoDescription: true },
      })
    : [];
  const answers = new Map(rows.map((r) => [r.id, r]));
  const guides = shown.map((g) => {
    const r = answers.get(g.id);
    return {
      ...g,
      answer: r?.answer ?? "",
      snippet: plainText(r?.seoDescription?.trim() || r?.answer || "", 140),
    };
  });

  return (
    <>
      {guides.length > 0 && (
        <JsonLd
          data={faqPageLd(
            guides.map((g) => ({
              question: g.question,
              answerText: plainText(g.answer, 280),
            })),
          )}
        />
      )}

      <PageHero
        eyebrow={SECTION.money}
        title="Пенсии и социални помощи"
        intro="Накратко и на разбираем език: пенсии, помощ за отопление, ТЕЛК и към кого да се обърнете. Тук обясняваме къде да питате — без сложни думи."
        crumbs={[{ name: "Пенсии и помощи", path: "/pomoshti" }]}
      />

      <div className="container-content space-y-12 py-10">
        <ul role="list" className="grid gap-5 md:grid-cols-2">
          {TOPICS.map((t) => {
            const Icon = t.icon;
            return (
              <li key={t.title} className="panel h-full sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="icon-chip">
                    <Icon aria-hidden />
                  </span>
                  <h2 className="font-sans text-xl font-semibold text-slate-900">{t.title}</h2>
                </div>
                <ul className="mt-4 list-disc space-y-2 pl-6 text-base text-slate-700 marker:text-brand-600">
                  {t.points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
                {t.title === "Пенсии" && (
                  <p className="mt-3 text-base">
                    <a href="#konvertor" className="link inline-flex min-h-tap items-center">
                      Колко е в евро? Конвертор левове ↔ евро
                    </a>
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        {/* Важни телефони */}
        <section aria-labelledby="kam-kogo" className="callout-info sm:p-6">
          <h2 id="kam-kogo" className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Phone className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
            Към кого да се обърна
          </h2>
          {contactsInOrder.length > 0 ? (
            <ul role="list" className="mt-4 grid gap-4 md:grid-cols-3">
              {contactsInOrder.map((c) => (
                <li key={c.slug} className="panel flex h-full flex-col rounded-xl">
                  <h3 className="h-card">{c.name}</h3>
                  <p className="mt-1 text-base text-slate-700">
                    {CONTACT_HINT[c.slug as (typeof CONTACT_SLUGS)[number]]}
                  </p>
                  {c.address && <p className="mt-1 text-base text-slate-600">{c.address}</p>}
                  <div className="mt-auto space-y-2 pt-3">
                    {c.phone && <PhoneButton phone={c.phone} full />}
                    <VerifiedBadge at={c.verifiedAt} source={c.verifiedSource} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="panel rounded-xl">
                <h3 className="h-card">НОИ — пенсии и осигуряване</h3>
                <p className="mt-1 text-base text-slate-700">Въпроси за пенсии и обезщетения.</p>
                <PhoneButton phone="0700 14 802" full className="mt-3" />
              </div>
              <div className="panel rounded-xl">
                <h3 className="h-card">Социално подпомагане</h3>
                <p className="mt-1 text-base text-slate-700">
                  За помощ за отопление и социални помощи — Дирекция „Социално подпомагане“. Вижте
                  телефона в{" "}
                  <Link href="/uslugi?cat=SOCIAL" className="link">
                    социалните услуги
                  </Link>
                  .
                </p>
              </div>
            </div>
          )}
          <p className="mt-4 text-base text-slate-700">
            Сроковете и условията се променят. Преди да тръгнете, обадете се да проверите какви
            документи са нужни — спестява второ ходене. Още телефони —{" "}
            <Link href="/uslugi?cat=SOCIAL" className="link">
              социални услуги
            </Link>
            .
          </p>
        </section>

        {/* Свързани ръководства */}
        {guides.length > 0 && topic && (
          <section aria-labelledby="stapka-po-stapka">
            <SectionHeader
              id="stapka-po-stapka"
              title="Стъпка по стъпка"
              href={topic.count > guides.length ? categoryPath(topic.slug) : undefined}
              hrefLabel={`Всички ${guidesLabel(topic.count)}`}
            />
            <ul role="list" className="grid gap-4 md:grid-cols-2">
              {guides.map((g) => (
                <li key={g.id}>
                  <GuideCard guide={g} as="h3" />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Конвертор левове ↔ евро — за стари суми в левове */}
        <div className="max-w-3xl">
          <EuroConverter />
          <p className="mt-2 text-base text-slate-600">
            Пенсиите и помощите се превалутират по този фиксиран курс — стойността се запазва.
            Повече за еврото:{" "}
            <Link href="/evroto" className="link">
              страница „Еврото“
            </Link>
            .
          </p>
        </div>

        <div className="max-w-3xl">
          <ArticleActions
            className="!mt-0"
            shareTitle="Пенсии и социални помощи — За Бобов дол"
            shareText="Пенсии, помощ за отопление, ТЕЛК и към кого да се обърнете — накратко и ясно."
            sharePath="/pomoshti"
          />
          <PrintSourceLine path="/pomoshti" />
        </div>
      </div>
    </>
  );
}
