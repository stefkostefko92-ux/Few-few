import type { Metadata } from "next";
import PismoStudio from "@/components/studios/PismoStudio";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатно мотивационно писмо на български";
const DESC =
  "Напиши мотивационно писмо за кандидатстване за работа — чист шаблон, AI чернова с Gemini, печат или PDF. Безплатно, на български, без регистрация.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "мотивационно писмо",
    "мотивационно писмо образец",
    "мотивационно писмо за работа",
    "как да напиша мотивационно писмо",
    "придружително писмо",
    "мотивационно писмо шаблон",
  ],
  alternates: { canonical: "/pismo" },
  ...pageMeta(TITLE, DESC),
};

const FAQ = [
  {
    q: "Как се пише мотивационно писмо?",
    a: "Доброто мотивационно писмо е кратко (до половин страница) и има три части: защо пишеш (за коя позиция кандидатстваш), защо си подходящ (2–3 конкретни силни страни, свързани с обявата) и покана за разговор. Пиши от първо лице, топло и конкретно, без клишета. В Мастилко описваш накратко себе си, а AI подрежда черновата — ти я правиш своя.",
  },
  {
    q: "Каква е разликата между мотивационно и придружително писмо?",
    a: "На практика са едно и също — придружително писмо (cover letter) е писмото, което придружава автобиографията при кандидатстване за работа. „Мотивационно писмо“ е по-често използваният български термин. И двете обясняват защо кандидатстваш и защо си подходящ за позицията.",
  },
  {
    q: "Трябва ли мотивационно писмо към всяка автобиография?",
    a: "Не винаги е задължително, но силно помага — показва мотивация и позволява да разкажеш това, което сухата автобиография не побира. Добра практика е да пишеш ново писмо за всяка кандидатура, съобразено с конкретната фирма и обява. Мастилко върви заедно с CV инструмента, за да подготвиш и двете на едно място.",
  },
];

const base = toolJsonLd({
  name: "Мотивационно писмо",
  path: "/pismo",
  description: DESC,
  category: "BusinessApplication",
});
const pismoJsonLd = {
  ...base,
  "@graph": [
    ...base["@graph"],
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

export default function PismoPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          ✉️ Мотивационно писмо
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Най-трудната част от кандидатстването — по-лесна: попълни за коя
          позиция кандидатстваш, кажи 2–3 неща за себе си и AI пише чернова,
          която правиш своя. Върви си с <a className="font-semibold text-tera-dark underline" href="/cv">CV-то</a>.
          Данните остават само в твоя браузър.
        </p>
      </header>
      <PismoStudio />

      <section className="no-print mx-auto mt-16 max-w-3xl">
        <h2 className="font-display text-2xl font-bold">Въпроси за мотивационното писмо</h2>
        <div className="mt-6 space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="card-warm group p-5 open:shadow-lift">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">
                <span className="mr-2 inline-block text-tera transition group-open:rotate-90">▸</span>
                {f.q}
              </summary>
              <p className="mt-2 pl-6 text-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pismoJsonLd) }}
      />
    </div>
  );
}
