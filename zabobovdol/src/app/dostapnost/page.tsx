import type { Metadata } from "next";
import Link from "next/link";
import {
  Type,
  Contrast,
  Moon,
  Hand,
  Ear,
  MessageSquare,
  Mail,
  MapPin,
  Phone,
  Keyboard,
  ExternalLink,
  type LucideIcon,
} from "@/components/icons";
import { PageHero, StepList } from "@/components/ui";
import { LegalLayout, LegalMeta, type Toc } from "@/components/LegalDoc";
import { JsonLd } from "@/components/JsonLd";
import { TelLink } from "@/components/TelLink";
import { buildMetadata, faqPageLd } from "@/lib/seo";
import { SECTION } from "@/lib/section-names";
import { SITE } from "@/lib/site";
import { UI_LABEL, quoted } from "@/lib/ui-labels";

// Динамична: редът „отпечатано на …“ на хартия (PrintSourceLine) е денят на
// зареждане, не денят на билда.
export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Достъпност — помощ за хора с увреждания на зрението, слуха и моториката",
  description:
    "Как да ползвате сайта „За Бобов дол“ по-лесно: уголемяване на текста, висок контраст, тъмен режим и по-големи бутони. Връзка с институции без обаждане за хора с увреден слух и достъп до 112 за глухи и хора с говорни затруднения.",
  path: "/dostapnost",
  keywords: [
    "достъпност Бобов дол",
    "декларация за достъпност",
    "по-голям текст и висок контраст",
    "112 за хора с увреден слух",
    "връзка с институции без обаждане",
    "За Бобов дол",
    "Carbon Stealth",
  ],
});

// Дата на последната промяна на страницата (не на самооценката — нейните
// дати са в декларацията по-долу).
const LAST_CHANGE_ISO = "2026-10-25";

const TOC = {
  nastroyki: "Нагласете сайта за себе си",
  "bez-obazhdane": "Връзка без обаждане",
  "spesen-112": "112 за хора с увреден слух или говор",
  "chesti-vaprosi": "Чести въпроси",
  deklaraciya: "Декларация за достъпност",
} as const satisfies Toc;

// Надписите съвпадат с лентата най-горе („Аа Настройки за четене“: Текст А А А,
// Контраст, Тъмен режим, По-лесно докосване) — виж UI_LABEL.
const BAR = quoted(UI_LABEL.readingBar);
const BAR_SHORT = quoted(UI_LABEL.readingBarShort);

// Въпроси и отговори — за AEO (Answer Engine Optimization) и гласови търсачки.
// Показват се и на страницата (раздел „Чести въпроси“): FAQPage в JSON-LD е
// само за съдържание, което човекът вижда.
const FAQ: { question: string; answerText: string }[] = [
  {
    question: "Как да уголемя текста на сайта?",
    answerText: `Най-горе на всяка страница натиснете ${BAR} (на телефон — ${BAR_SHORT}) и после едно от трите „А“ до „Текст“ — нормален, голям или много голям. Изборът се запомня за следващите посещения.`,
  },
  {
    question: "Не чувам добре по телефона. Как да се свържа с институция?",
    answerText:
      "Може да пишете по имейл, да използвате онлайн заявка през egov.bg или да отидете на място (адрес и работно време са посочени при всяка услуга). Може да ни пишете и през чата или формата за контакт — текстово, без обаждане.",
  },
  {
    question: "Как глух човек или човек с говорни затруднения да повика 112?",
    answerText:
      "Национална система 112 предлага достъп за хора с увреден слух и говор чрез мобилно приложение и уеб приложение на 112.mvr.bg. Нужна е предварителна регистрация и одобрение на профила. Сигналът се подава текстово (чат или готови съобщения).",
  },
  {
    question: "Бутоните са ми малки за натискане. Какво да направя?",
    answerText: `Най-горе на всяка страница натиснете ${BAR} и после „По-лесно докосване“ — бутоните, връзките и полетата стават по-големи и по-лесни за натискане, удобно при треперене на ръцете.`,
  },
];

/**
 * Една възможност: иконно квадратче + заглавие + обяснение. `inset` — без
 * рамка и сянка, когато е вътре в цветна кутия (по-малко рамки една в друга).
 */
function Tool({
  icon: Icon,
  title,
  inset = false,
  children,
}: {
  icon: LucideIcon;
  title: string;
  inset?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        inset
          ? "flex gap-3 rounded-xl bg-white p-4 sm:gap-4"
          : "panel flex gap-3 p-4 sm:gap-4 sm:p-5"
      }
    >
      <span className="icon-chip-sm">
        <Icon aria-hidden />
      </span>
      <div className="min-w-0">
        <h3 className="h-card">{title}</h3>
        <p className="mt-1 text-base text-slate-700">{children}</p>
      </div>
    </div>
  );
}

export default function AccessibilityPage() {
  return (
    <>
      {/* BreadcrumbList идва от PageHero (crumbs). */}
      <JsonLd data={faqPageLd(FAQ, "/dostapnost")} />

      <PageHero
        eyebrow={SECTION.legal}
        title="Достъпност"
        intro="Този сайт е направен да е лесен за всички — включително за хора с по-слабо зрение, увреден слух или затруднена моторика. Ето как да го нагласите за себе си и как да се свържете с институциите по удобен за вас начин."
        crumbs={[{ name: "Достъпност", path: "/dostapnost" }]}
        meta={<LegalMeta updated={LAST_CHANGE_ISO} current="/dostapnost" />}
      />

      <LegalLayout toc={TOC} path="/dostapnost">
        <div className="space-y-12">
          {/* Инструменти за нагласяне */}
          <section aria-labelledby="nastroyki">
            <h2 id="nastroyki" className="section-title">
              {TOC.nastroyki}
            </h2>
            <p className="mt-4 text-lg text-slate-700">
              Всички тези бутони са в лентата най-горе на всяка страница, над менюто.
              Натиснете <strong className="font-semibold">{BAR}</strong> (на телефон —{" "}
              <strong className="font-semibold">{BAR_SHORT}</strong>), за да се покажат.
              Изборът ви се запомня за следващите посещения.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Tool icon={Type} title="По-голям текст">
                До „Текст“ натиснете едно от трите „А“ — нормален, голям или много
                голям. Уголемява се целият текст.
              </Tool>
              <Tool icon={Contrast} title="Контраст">
                Висок контраст — по-черен текст и по-силни граници за по-лесно четене
                при слабо зрение или на ярка светлина.
              </Tool>
              <Tool icon={Moon} title="Тъмен режим">
                По-тъмни цветове, по-щадящи за очите вечер и на тъмно. Не се включва
                заедно с контраста.
              </Tool>
              <Tool icon={Hand} title="По-лесно докосване">
                По-големи бутони, връзки и полета — удобно при треперене на ръцете
                или затруднена моторика.
              </Tool>
            </div>
          </section>

          {/* За хора с увреден слух */}
          <section aria-labelledby="bez-obazhdane" className="callout-info sm:p-6">
            <div className="flex items-start gap-3">
              <span className="icon-chip-sm bg-white">
                <Ear aria-hidden />
              </span>
              <h2 id="bez-obazhdane" className="h-sub pt-1.5">
                Не чувате добре по телефона? Свържете се без обаждане
              </h2>
            </div>
            <p className="mt-3 text-lg text-slate-800">
              Голяма част от услугите тук показват телефон, но почти винаги има и
              начин да се свържете{" "}
              <strong className="font-semibold">без да се обаждате</strong>:
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Tool inset icon={MessageSquare} title="Пишете ни текстово">
                Използвайте{" "}
                <Link href="/kontakti" className="link">
                  формата за контакт
                </Link>{" "}
                или дигиталния помощник (бутона {quoted(UI_LABEL.chat)} долу вдясно) — пишете
                въпроса си, без
                да звъните.
              </Tool>
              <Tool inset icon={Mail} title="Имейл">
                При повечето институции е посочен имейл. Пишете и ще ви отговорят
                писмено.
              </Tool>
              <Tool inset icon={MapPin} title="На място">
                При всяка услуга има адрес и работно време — може да отидете лично,
                ако ви е по-удобно.
              </Tool>
              <Tool inset icon={Keyboard} title="Онлайн заявки (egov.bg)">
                Много документи се заявяват изцяло онлайн, без обаждане и без
                ходене. Вижте обясненията в{" "}
                <Link href="/kak-da" className="link">
                  „Как да…“
                </Link>
                .
              </Tool>
            </div>
          </section>

          {/* 112 за хора с увреден слух/говор */}
          <section aria-labelledby="spesen-112" className="callout-danger sm:p-6">
            <div className="flex items-start gap-3">
              <span className="icon-chip-sm icon-chip-danger bg-white">
                <Phone aria-hidden />
              </span>
              <h2 id="spesen-112" className="h-sub pt-1.5">
                Спешен телефон 112 за хора с увреден слух или говор
              </h2>
            </div>
            <p className="mt-3 text-lg text-slate-800">
              Национална система 112 има специален начин за връзка за хора с увреден
              слух и говор — чрез <strong className="font-semibold">мобилно приложение</strong>{" "}
              (за телефон и таблет) и <strong className="font-semibold">уеб приложение</strong>{" "}
              на компютър. Сигналът се подава{" "}
              <strong className="font-semibold">текстово</strong> — чрез чат или готови
              съобщения, без да е нужно да говорите.
            </p>
            <StepList
              tone="danger"
              className="mt-5"
              steps={[
                "Регистрирайте се предварително на официалния сайт 112.mvr.bg и активирайте профила си след одобрение от 112. Направете го отрано — преди да ви потрябва спешно.",
                "При нужда отваряте приложението и подавате сигнал текстово (чат или готов текст).",
                "Съюзът на глухите в България провежда обучения за ползване на приложението.",
              ]}
            />
            <a
              href="https://112.mvr.bg"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary no-print mt-6 w-full sm:w-auto"
            >
              Към 112.mvr.bg
              <ExternalLink className="h-5 w-5" aria-hidden />
              <span className="sr-only">(отваря се в нов раздел)</span>
            </a>
          </section>

          <section aria-labelledby="chesti-vaprosi">
            <h2 id="chesti-vaprosi" className="section-title">
              {TOC["chesti-vaprosi"]}
            </h2>
            <div className="mt-5 space-y-3">
              {FAQ.map((f) => (
                <div key={f.question} className="panel">
                  <h3 className="h-card">{f.question}</h3>
                  <p className="mt-1 text-base text-slate-700">{f.answerText}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Формална Декларация за достъпност по Закона за изискванията за
              достъпност на продуктите и услугите (транспониращ Директива (ЕС)
              2019/882 — EAA) и EN 301 549 / WCAG 2.1. */}
          <section aria-labelledby="deklaraciya">
            <h2 id="deklaraciya" className="section-title">
              {TOC.deklaraciya}
            </h2>
            <div className="prose-content mt-5 text-slate-700">
              <p>
                <strong>{SITE.name}</strong> се ангажира да осигури достъпност на
                този сайт в съответствие с европейския стандарт{" "}
                <strong>EN 301 549</strong> и насоките{" "}
                <strong>WCAG 2.1, ниво AA</strong>, и с изискванията на Закона за
                изискванията за достъпност на продуктите и услугите (транспониращ
                Директива (ЕС) 2019/882).
              </p>

              <h3>Състояние на съответствие</h3>
              <p>
                Сайтът е в <strong>частично съответствие</strong> с WCAG 2.1 ниво AA
                — поради изброените по-долу несъответствия, по които продължаваме да
                работим.
              </p>

              <h3>Недостъпно съдържание (известни ограничения)</h3>
              <ul>
                <li>
                  Вградени карти и външни услуги (напр. карта на „Опознайте Бобов дол“,
                  прогнозата за времето) идват от трети страни и може да имат
                  собствени ограничения за достъпност, които не контролираме изцяло.
                </li>
                <li>
                  Някои документи и материали за печат (PDF, плакати, брошура) може
                  да не отговарят напълно на изискванията за достъпни документи.
                </li>
                <li>
                  Връзки към сайтове на институции (egov.bg, общината и др.) водят
                  към съдържание, за чиято достъпност отговарят съответните
                  институции.
                </li>
              </ul>

              <h3>Изготвяне на декларацията</h3>
              <p>
                Тази декларация е изготвена на <strong>30 юни 2026 г.</strong> въз
                основа на <strong>самооценка</strong> — ръчен преглед спрямо WCAG 2.1
                AA, съчетан с автоматизирани проверки и вътрешен одит. Последен
                преглед: <strong>юни 2026 г.</strong>
              </p>

              <h3>Обратна връзка и сигнали за достъпност</h3>
              <p>
                Ако срещнете пречка за достъпност или съдържание, което не можете да
                ползвате, пишете ни — ще се постараем да отговорим и да отстраним
                проблема{" "}
                <strong>в разумен срок (обикновено до един месец)</strong>:
              </p>
              <ul>
                {SITE.contact.email && (
                  <li>
                    Имейл:{" "}
                    <a href={`mailto:${SITE.contact.email}`}>{SITE.contact.email}</a>
                  </li>
                )}
                {SITE.contact.phone && (
                  <li>
                    Телефон: <TelLink phone={SITE.contact.phone} />
                  </li>
                )}
                <li>
                  Форма за контакт: <Link href="/kontakti">Контакти</Link>
                </li>
              </ul>

              <h3>Процедура по прилагане</h3>
              <p>
                Ако не получите отговор или не сте доволни от отговора, можете да
                подадете сигнал до компетентния надзорен орган по достъпността в
                Република България. За въпроси, свързани със защита на потребителите,
                компетентна е <strong>Комисията за защита на потребителите</strong> —{" "}
                <a href="https://kzp.bg" target="_blank" rel="noopener noreferrer">
                  kzp.bg
                </a>
                .
              </p>
            </div>
          </section>

          <p className="text-lg text-slate-700">
            Имате затруднение със сайта или идея как да го направим по-достъпен?
            Пишете ни на{" "}
            <Link href="/kontakti" className="link">
              Контакти
            </Link>
            {SITE.contact.phone && (
              <>
                {" "}
                или на <TelLink phone={SITE.contact.phone} className="link" />
              </>
            )}
            .
          </p>
        </div>
      </LegalLayout>
    </>
  );
}
