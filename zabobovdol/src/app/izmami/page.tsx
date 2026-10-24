import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, Ban, Info, Lock, PhoneOff, type LucideIcon } from "@/components/icons";
import { prisma } from "@/lib/prisma";
import { ArticleActions, PageHero, Prose, SectionHeader, StepList } from "@/components/ui";
import { buildMetadata, faqPageLd } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { JsonLd } from "@/components/JsonLd";
import { SITE } from "@/lib/site";
import { TrustCard } from "@/components/TrustCard";
import { TelLink } from "@/components/TelLink";
import { PhoneButton } from "@/components/PhoneButton";
import { PrintSourceLine } from "@/components/PrintSourceLine";
import { sourceLink } from "@/components/VerifiedBadge";
import { formatDate, isoDate } from "@/lib/format-date";
import { getGuideIndex } from "@/lib/howto-index";
import { SCAM_TOPIC, categoryPath, categorySlug, guidesLabel } from "@/lib/howto";
import { GuideCard } from "@/app/kak-da/_components/GuideList";

export const dynamic = "force-dynamic";

/** Колко ръководства от темата се показват тук (останалите — на страницата на темата). */
const GUIDES_SHOWN = 10;

export const metadata: Metadata = buildMetadata({
  title: "Пази се от измами — как да разпознаете телефонни и онлайн измами",
  description:
    "Прости правила, които пазят възрастните хора от телефонни и онлайн измами: фалшиви обаждания от „банка“, схемата с „внуче в беда“, измамни SMS и награди. Какво да направите, ако вече сте били измамени.",
  path: "/izmami",
  keywords: [
    "измами Бобов дол",
    "телефонни измами",
    "фалшиви обаждания от банка",
    "измами с възрастни хора",
    "как да разпознаем измама",
    "Carbon Stealth",
  ],
});

// Нивото на предупреждението → кутия, значка и цвят на иконата (цветови роли:
// червено — опасност, кехлибар — внимание, синьо — сведение). Пълни имена на
// класовете — иначе Tailwind не ги генерира. Значката е плътна (бял текст):
// .badge-* е със същия фон като кутията и в нея се губеше. Цветовете не се
// пренасочват в тъмен режим; на хартия фонът не се печата → рамка и черен текст.
const BADGE_SOLID =
  "inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-sm font-semibold text-white print:bg-white print:text-black print:ring-1 print:ring-black";
const SEVERITY: Record<
  string,
  { box: string; badge: string; icon: LucideIcon; iconCls: string; label: string }
> = {
  danger: {
    box: "callout-danger",
    badge: `${BADGE_SOLID} bg-crimson-700`,
    icon: AlertTriangle,
    iconCls: "text-crimson-700",
    label: "Опасно",
  },
  warning: {
    box: "callout-warning",
    badge: `${BADGE_SOLID} bg-amber-800`,
    icon: AlertTriangle,
    iconCls: "text-amber-700",
    label: "Внимание",
  },
  info: {
    box: "callout-info",
    badge: `${BADGE_SOLID} bg-brand-700`,
    icon: Info,
    iconCls: "text-brand-700",
    label: "Информация",
  },
};

const GOLDEN_RULES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Lock,
    title: "Никога не давайте кодове и пароли",
    text: "Банка, НОИ или полиция НИКОГА не искат по телефона ПИН, парола, код от SMS или номер на картата. Поискат ли — това е измама.",
  },
  {
    icon: PhoneOff,
    title: "Затворете и звъннете сами",
    text: "При съмнително обаждане затворете. Намерете официалния телефон (на гърба на картата или на сметката) и звъннете вие — не на номера, който са ви дали.",
  },
  {
    icon: Ban,
    title: "Не бързайте и не се плашете",
    text: "Измамниците бързат и плашат („веднага“, „спешно“, „внукът ви е в беда“). Спрете. Обадете се на близък и попитайте, преди да направите каквото и да е.",
  },
  {
    icon: AlertTriangle,
    title: "Не давайте пари на непознати",
    text: "Никой роднина няма да прати непознат да вземе пари или злато от вкъщи. При такова искане — затворете и звъннете на роднината директно.",
  },
];

const IF_SCAMMED = [
  "Обадете се незабавно на банката си и поискайте да блокират картата/сметката. Телефонът е на гърба на картата.",
  "Подайте сигнал в полицията на 112 или в районното управление. Опишете какво се случи.",
  "Запазете всичко — съобщения, номера, документи за преводи. Те помагат на разследването.",
  "Кажете на близък човек. Не се срамувайте — измамниците лъжат професионално и жертва може да стане всеки.",
  "Сменете паролите си, ако сте ги издали, и следете сметката за нови движения.",
];

export default async function ScamProtectionPage() {
  const [alerts, index] = await Promise.all([
    prisma.scamAlert.findMany({
      where: { published: true },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    }),
    getGuideIndex(),
  ]);

  // Ръководствата от обединената тема „Безопасност и измами“ (с всичките ѝ
  // синоними) — първите по реда на темата; отговорите само за тях.
  const topic = index.categoryBySlug.get(categorySlug(SCAM_TOPIC));
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
        eyebrow="Безопасност"
        title="Пази се от измами"
        intro="Измамниците често търсят точно възрастните хора. Тук са простите правила, които ви пазят — и какво да направите, ако вече сте били измамени."
        crumbs={[{ name: "Пази се от измами", path: "/izmami" }]}
      />

      <div className="container-content space-y-12 py-10">
        {/* Активни предупреждения в момента */}
        {alerts.length > 0 && (
          <section aria-labelledby="v-momenta">
            <SectionHeader id="v-momenta" title="Внимание — измами в момента" />
            <div className="max-w-3xl space-y-4">
              {alerts.map((a) => {
                const s = SEVERITY[a.severity] ?? SEVERITY.warning;
                const Icon = s.icon;
                const srcUrl = a.sourceUrl ? sourceLink(a.sourceUrl) : null;
                const srcLabel =
                  a.source.trim() || (srcUrl ? srcUrl.hostname.replace(/^www\./, "") : "");
                return (
                  <article key={a.id} className={`${s.box} flex flex-col gap-2 sm:flex-row sm:gap-3`}>
                    <Icon className={`h-6 w-6 shrink-0 sm:mt-1 ${s.iconCls}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <span className={s.badge}>{s.label}</span>
                      <h3 className="h-card mt-1.5">{a.title}</h3>
                      <p className="text-meta mt-1">
                        Публикувано на{" "}
                        <time dateTime={isoDate(a.createdAt)}>{formatDate(a.createdAt)}</time>
                        {srcLabel && (
                          <>
                            {" · "}източник:{" "}
                            {srcUrl ? (
                              <a
                                href={srcUrl.toString()}
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                                className="link"
                              >
                                {srcLabel}
                              </a>
                            ) : (
                              <span className="font-semibold">{srcLabel}</span>
                            )}
                          </>
                        )}
                      </p>
                      {a.summary && <p className="mt-2 text-base text-slate-800">{a.summary}</p>}
                      {a.body && (
                        <div className="mt-2">
                          <Prose html={renderMarkdown(a.body)} />
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* Златни правила */}
        <section aria-labelledby="pravila">
          <SectionHeader id="pravila" title="4 златни правила" />
          <ul role="list" className="grid gap-4 sm:grid-cols-2">
            {GOLDEN_RULES.map((r) => {
              const Icon = r.icon;
              return (
                <li key={r.title} className="panel flex h-full flex-col gap-3 sm:flex-row sm:gap-4">
                  <span className="icon-chip">
                    <Icon aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h3 className="h-card">{r.title}</h3>
                    <p className="mt-1 text-base text-slate-700">{r.text}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Кои сме ние наистина — до златните правила, за да не ни имитират. */}
        <TrustCard />

        {/* Какво да направя, ако вече съм измамен */}
        <section aria-labelledby="ako-vi-izmamiha" className="callout-danger max-w-3xl sm:p-6">
          <h2
            id="ako-vi-izmamiha"
            className="flex items-start gap-2 text-2xl font-bold text-slate-900"
          >
            <AlertTriangle className="mt-1 h-6 w-6 shrink-0 text-crimson-700" aria-hidden />
            <span>Ако вече ви измамиха — действайте веднага</span>
          </h2>
          <StepList steps={IF_SCAMMED} tone="danger" className="mt-5" />
          <div className="mt-6 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
            <PhoneButton phone="112" label="Спешност" variant="danger" />
            <Link href="/uslugi?cat=EMERGENCY" className="btn-secondary w-full sm:w-auto">
              Важни телефони
            </Link>
          </div>
        </section>

        {/* Свързани подробни ръководства */}
        {guides.length > 0 && topic && (
          <section aria-labelledby="podrobno">
            <SectionHeader
              id="podrobno"
              title="Подробни обяснения"
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

        <div className="max-w-3xl">
          <ArticleActions
            className="!mt-0"
            shareTitle="Пази се от измами — За Бобов дол"
            shareText="Прости правила срещу телефонни и онлайн измами. Изпратете ги на близките си."
            sharePath="/izmami"
            printLabel="Отпечатайте съветите"
          />
          <p className="mt-6 text-base text-slate-700">
            Имате съмнение за измама или искате да предупредите съседите? Обадете ни се на{" "}
            <TelLink phone={SITE.contact.phone} className="link whitespace-nowrap" />.
          </p>
          <PrintSourceLine path="/izmami" />
        </div>
      </div>
    </>
  );
}
