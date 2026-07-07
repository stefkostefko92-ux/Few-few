import Link from "next/link";
import type { Metadata } from "next";
import Logo from "@/components/Logo";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const TOOLS = [
  {
    href: "/etiketi",
    emoji: "🏷️",
    title: "Етикети",
    text: "За буркани, кутии, тетрадки, продукти. Избираш размер и цвят, пишеш текста — цял лист А4, готов за рязане.",
    accent: "bg-tera-pale text-tera-dark",
  },
  {
    href: "/vizitki",
    emoji: "💼",
    title: "Визитки",
    text: "Стандартни 90 × 54 mm, топли шаблони, 10 визитки на лист. Име, телефон, имейл — и си готов за срещата.",
    accent: "bg-med-pale text-med-dark",
  },
  {
    href: "/cv",
    emoji: "📄",
    title: "Автобиография (CV)",
    text: "Чист, професионален шаблон на български. Попълваш стъпка по стъпка, а AI помага с описанията.",
    accent: "bg-gora-pale text-gora-dark",
  },
];

const STEPS = [
  { n: "1", title: "Избери инструмент", text: "Етикети, визитки или CV — без регистрация и без инсталиране." },
  { n: "2", title: "Попълни и виж на живо", text: "Всяка буква се появява веднага в прегледа. Данните остават само в твоя браузър." },
  { n: "3", title: "Принтирай или запази PDF", text: "Точен А4 лист в милиметри — вкъщи, в офиса или в копирния център." },
];

const FAQ = [
  {
    q: "Наистина ли е безплатно?",
    a: "Да, изцяло. Без регистрация, без воден знак, без „премиум“ версия. Мастилко е малък подарък от Carbon Stealth VCC.",
  },
  {
    q: "Къде се пазят данните ми?",
    a: "Само в твоя браузър (localStorage на устройството ти). Ние нямаме база данни с твоите етикети, визитки или CV и не виждаме какво пишеш.",
  },
  {
    q: "Как работи AI помощта?",
    a: "Когато натиснеш AI бутона, описанието ти се изпраща през нашия сървър към Google Gemini (безплатния Flash модел) и получаваш предложения. Нищо не се изпраща без твое действие.",
  },
  {
    q: "Мога ли да запазя PDF вместо да принтирам?",
    a: "Да — в прозореца за печат избери „Запази като PDF“ (има го във всеки модерен браузър). Файлът е същият точен А4 лист.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Херо */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-med-pale blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-tera-pale blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 text-center sm:pt-20">
          <Logo priority className="mx-auto h-36 w-36 drop-shadow-lg sm:h-44 sm:w-44" />
          <h1 className="font-display mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
            Етикети, визитки и CV —{" "}
            <span className="text-tera">топло и безплатно</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-soft">
            Мастилко е малкото българско ателие в браузъра ти: попълваш,
            виждаш на живо, принтираш на А4. Без регистрация, без реклами,
            с безплатна AI помощ от Gemini.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/etiketi" className="btn-primary">
              🏷️ Направи етикети
            </Link>
            <Link href="/vizitki" className="btn-secondary">
              💼 Визитки
            </Link>
            <Link href="/cv" className="btn-secondary">
              📄 CV
            </Link>
          </div>
        </div>
      </section>

      {/* Отговор-отпред: какво е Мастилко (за хора, търсачки и AI асистенти) */}
      <section className="mx-auto max-w-3xl px-4 pb-12">
        <p className="card-warm p-5 text-center text-ink-soft">
          <strong className="text-ink">Мастилко е безплатен онлайн инструмент на български</strong>{" "}
          за създаване на етикети за печат (11 стандартни размера, вкл. 70 × 36 mm),
          визитки (90 × 54 mm, 10 на лист) и автобиографии — вкл. Europass шаблон.
          Работи в браузъра, без регистрация; резултатът се принтира на А4 с точни
          размери в милиметри или се запазва като PDF.
        </p>
      </section>

      {/* Инструменти */}
      <section className="mx-auto max-w-6xl px-4">
        <div className="grid gap-6 md:grid-cols-3">
          {TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="card-warm group flex flex-col p-6 transition hover:-translate-y-1 hover:shadow-lift"
            >
              <span
                className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ${t.accent}`}
                aria-hidden
              >
                {t.emoji}
              </span>
              <h2 className="font-display mt-4 text-2xl font-bold">{t.title}</h2>
              <p className="mt-2 flex-1 text-ink-soft">{t.text}</p>
              <span className="mt-4 font-semibold text-tera-dark transition group-hover:translate-x-1">
                Започни →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Как работи */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-center text-3xl font-bold">
          Как работи?
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card-warm p-6 text-center">
              <span className="font-display mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-ink text-lg font-bold text-paper">
                {s.n}
              </span>
              <h3 className="mt-3 text-lg font-bold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-ink-soft">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* AI */}
      <section className="mx-auto max-w-6xl px-4">
        <div className="card-warm relative overflow-hidden bg-gradient-to-br from-white/90 to-med-pale/70 p-8 sm:p-10">
          <h2 className="font-display text-3xl font-bold">
            ✨ Малко магия от Gemini — безплатно
          </h2>
          <p className="mt-3 max-w-2xl text-ink-soft">
            Не ти хрумва текст за етикета? Трябва ти слоган за визитката или
            по-силно описание на опита ти в CV-то? Натисни AI бутона и
            безплатният Google Gemini Flash предлага варианти на български —
            ти избираш кой да остане. Твоят текст се изпраща само когато ти
            поискаш.
          </p>
        </div>
      </section>

      {/* Въпроси */}
      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="font-display text-center text-3xl font-bold">
          Чести въпроси
        </h2>
        <div className="mt-8 space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="card-warm group p-5 open:shadow-lift">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">
                <span className="mr-2 text-tera transition group-open:rotate-90 inline-block">
                  ▸
                </span>
                {f.q}
              </summary>
              <p className="mt-2 pl-6 text-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* JSON-LD за търсачки и AI асистенти */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                "@id": "https://carbonstealth.eu/#org",
                name: "Carbon Stealth VCC",
                url: "https://carbonstealth.eu",
                sameAs: ["https://github.com/stefkostefko92-ux"],
                knowsAbout: [
                  "етикети за печат",
                  "визитки",
                  "автобиография CV",
                  "Europass",
                ],
              },
              {
                "@type": "WebSite",
                "@id": "https://mastilko.carbonstealth.eu/#site",
                name: "Мастилко",
                url: "https://mastilko.carbonstealth.eu",
                inLanguage: "bg",
                publisher: { "@id": "https://carbonstealth.eu/#org" },
              },
              {
                "@type": "WebApplication",
                name: "Мастилко",
                url: "https://mastilko.carbonstealth.eu",
                applicationCategory: "DesignApplication",
                operatingSystem: "Web",
                inLanguage: "bg",
                isAccessibleForFree: true,
                offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
                description:
                  "Безплатно създаване на етикети за печат, визитки и автобиографии (CV, вкл. Europass) на български език, направо в браузъра.",
                publisher: { "@id": "https://carbonstealth.eu/#org" },
              },
              {
                "@type": "FAQPage",
                mainEntity: FAQ.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              },
            ],
          }),
        }}
      />
    </>
  );
}
