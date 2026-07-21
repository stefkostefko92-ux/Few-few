import type { Metadata } from "next";
import Image from "next/image";
import PismoStudio from "@/components/studios/PismoStudio";
import ToolFaq, { type Faq } from "@/components/ToolFaq";
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
  ...pageMeta(TITLE, DESC, "/pismo"),
};

const HOWTO = {
  name: "Как да напишеш мотивационно писмо",
  steps: [
    "Попълни за коя позиция и фирма кандидатстваш.",
    "Кажи 2–3 свои силни страни; AI подрежда чернова на български.",
    "Прегледай, редактирай и запази като PDF или принтирай.",
  ],
};

const FAQ: Faq[] = [
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

const pismoJsonLd = toolJsonLd({
  name: "Мотивационно писмо",
  path: "/pismo",
  description: DESC,
  category: "BusinessApplication",
  howTo: HOWTO,
  faq: FAQ,
});

export default function PismoPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display flex items-center gap-3 text-3xl font-bold sm:text-4xl">
          <Image src="/icons/pismo.webp" alt="" width={56} height={56} unoptimized className="h-12 w-12 object-contain sm:h-14 sm:w-14" aria-hidden />
          Мотивационно писмо
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Най-трудната част от кандидатстването — по-лесна: попълни за коя
          позиция кандидатстваш, кажи 2–3 неща за себе си и AI пише чернова,
          която правиш своя. Върви си с <a className="font-semibold text-tera-dark underline" href="/cv">CV-то</a>.
          Данните остават само в твоя браузър.
        </p>
      </header>
      <PismoStudio />
      <ToolFaq items={FAQ} heading="Въпроси за мотивационното писмо" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pismoJsonLd) }}
      />
    </div>
  );
}
