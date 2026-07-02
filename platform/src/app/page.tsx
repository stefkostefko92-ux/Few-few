import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LegalFooter } from "@/components/LegalFooter";
import { safeJsonLd } from "@/lib/seo";

export const dynamic = "force-dynamic";

const BASE =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://platform.carbonstealth.eu";

const TITLE = "Конструктор на сайтове на български | Carbon Stealth";
const DESCRIPTION =
  "Създайте професионален уебсайт на български без код: готови шаблони, " +
  "собствен домейн, AI помощник и три езика. Публикувате за минути, " +
  "готово за Google и AI търсачки.";

// Публичната маркетингова страница е ЕДИНСТВЕНАТА индексируема страница на самата
// платформа (панелът е noindex). Отменя root layout robots:index:false.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${BASE}/` },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: `${BASE}/`,
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Carbon Stealth",
    locale: "bg_BG",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const FEATURES: { title: string; body: string }[] = [
  {
    title: "Готови шаблони",
    body: "Започнете от професионален шаблон за община, клиника, ресторант, магазин или портфолио и го направете свой за минути.",
  },
  {
    title: "Собствен домейн",
    body: "Публикувайте на наш поддомейн или на вашия собствен домейн с автоматичен HTTPS сертификат.",
  },
  {
    title: "AI помощник",
    body: "Генерирайте, подобрявайте и превеждайте съдържание с вграден AI — на български, английски и италиански.",
  },
  {
    title: "Готово за търсачки",
    body: "Всеки сайт излиза със структурирани данни, sitemap и hreflang — открива се от Google и от AI търсачките.",
  },
  {
    title: "Достъпност",
    body: "Вграден одит по WCAG 2.1 AA проверява контраст, алтернативни текстове и структура още докато строите.",
  },
  {
    title: "Форми и заявки",
    body: "Събирайте запитвания през контактна форма със защита на данните и известия по имейл.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Трябва ли да мога да програмирам?",
    a: "Не. Строите сайта с готови блокове чрез плъзгане и настройка — без код. AI помощникът пише текстовете вместо вас.",
  },
  {
    q: "Мога ли да ползвам собствен домейн?",
    a: "Да. Свързвате вашия домейн, потвърждавате го през DNS запис и платформата издава автоматично HTTPS сертификат.",
  },
  {
    q: "На какви езици може да е сайтът?",
    a: "На български, английски и италиански — с автоматичен езиков превключвател и правилни hreflang сигнали за търсачките.",
  },
  {
    q: "Има ли безплатен вариант?",
    a: "Да. Безплатните сайтове носят малък воден знак „Carbon Stealth“. Премиум планът го маха и отключва допълнителни възможности.",
  },
];

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${BASE}/#org`,
        name: "Carbon Stealth VCC",
        url: BASE,
      },
      {
        "@type": "WebSite",
        "@id": `${BASE}/#website`,
        url: BASE,
        name: "Carbon Stealth — конструктор на сайтове",
        inLanguage: "bg",
        publisher: { "@id": `${BASE}/#org` },
      },
      {
        "@type": "SoftwareApplication",
        name: "Carbon Stealth — конструктор на сайтове",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: ["bg", "en", "it"],
        description: DESCRIPTION,
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
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
  };

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      {/* Хедър */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="text-lg font-semibold text-white">Carbon Stealth</span>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/login" className="text-ink-300 hover:text-white">
            Вход
          </Link>
          <Link href="/register" className="btn-primary px-4 py-2">
            Създай сайт
          </Link>
        </nav>
      </header>

      {/* Hero — отговор отпред */}
      <section className="mx-auto max-w-3xl px-6 pb-8 pt-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Направете професионален сайт на български — без код
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-ink-300">
          Carbon Stealth е конструктор на уебсайтове: избирате готов шаблон,
          редактирате го с блокове, публикувате го на собствен домейн на три
          езика. Готов за Google и за AI търсачките — за минути.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/register" className="btn-primary px-6 py-3 text-base">
            Създайте сайт безплатно
          </Link>
          <Link
            href="/legal"
            className="px-6 py-3 text-base text-ink-300 hover:text-white"
          >
            Правна информация
          </Link>
        </div>
      </section>

      {/* Възможности */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        <h2 className="mb-8 text-center text-2xl font-semibold text-white">
          Всичко за професионален сайт
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card">
              <h3 className="mb-1 font-medium text-white">{f.title}</h3>
              <p className="text-sm text-ink-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Как работи */}
      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="mb-8 text-center text-2xl font-semibold text-white">
          Как работи
        </h2>
        <ol className="space-y-4">
          {[
            "Изберете готов шаблон и въведете името на бизнеса си.",
            "Редактирайте текст и снимки с блокове — AI помага с текстовете.",
            "Свържете свой домейн или ползвайте наш поддомейн.",
            "Публикувайте — сайтът излиза с HTTPS, sitemap и структурирани данни.",
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                {i + 1}
              </span>
              <span className="pt-0.5 text-ink-300">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Въпроси */}
      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="mb-8 text-center text-2xl font-semibold text-white">
          Често задавани въпроси
        </h2>
        <div className="space-y-4">
          {FAQ.map((f) => (
            <div key={f.q} className="card">
              <h3 className="mb-1 font-medium text-white">{f.q}</h3>
              <p className="text-sm text-ink-400">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Призив */}
      <section className="mx-auto max-w-3xl px-6 py-12 text-center">
        <h2 className="text-2xl font-semibold text-white">Готови ли сте?</h2>
        <p className="mx-auto mt-2 max-w-xl text-ink-300">
          Създайте първия си сайт безплатно още сега.
        </p>
        <Link
          href="/register"
          className="btn-primary mt-5 inline-block px-6 py-3 text-base"
        >
          Създайте сайт
        </Link>
      </section>

      <div className="mx-auto max-w-5xl px-6">
        <LegalFooter />
      </div>
    </div>
  );
}
