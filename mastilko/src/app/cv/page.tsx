import type { Metadata } from "next";
import Image from "next/image";
import CvStudio from "@/components/studios/CvStudio";
import ToolFaq, { type Faq } from "@/components/ToolFaq";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатна автобиография (CV) на български — вкл. Europass";
const DESC =
  "Създай чиста, професионална автобиография на български — модерен, класически или Europass шаблон (стандарт на ЕС). AI помага с описанията, запазваш като PDF. Безплатно.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "CV на български",
    "автобиография образец",
    "Europass CV",
    "автобиография шаблон",
    "как да направя CV",
    "CV за работа",
    "безплатно CV",
    "автобиография PDF",
  ],
  alternates: { canonical: "/cv" },
  ...pageMeta(TITLE, DESC, "/cv"),
};

const HOWTO = {
  name: "Как да си направиш автобиография (CV)",
  steps: [
    "Избери шаблон — модерен, класически или Europass (стандарт на ЕС).",
    "Попълни лични данни, професионален профил, трудов опит, образование, умения и езици; AI помага с описанията.",
    "Натисни „Принтирай / запази PDF“ на мащаб 100% — готов файл за кандидатстване.",
  ],
};

const FAQ: Faq[] = [
  {
    q: "Какво трябва да съдържа едно CV?",
    a: "Добрата автобиография събира на един-два листа: лични и контактни данни, кратък професионален профил (2–3 изречения), трудов опит с периоди и постижения, образование, умения и езици. За кандидатстване в ЕС често се иска и Europass формат. Мастилко подрежда всичко това автоматично в чист шаблон — ти само попълваш полетата.",
  },
  {
    q: "Каква е разликата между обикновено CV и Europass?",
    a: "Europass е единният стандарт за автобиография на Европейския съюз — с фиксирана структура (лична информация, трудов стаж, образование, езици с ниво по Общата европейска езикова рамка, дигитални умения, категория на книжката). Обикновеното CV е по-свободно и по-кратко. Мастилко предлага и трите: модерен, класически и Europass шаблон — сменяш с едно кликване.",
  },
  {
    q: "Как да запазя автобиографията си като PDF?",
    a: "Натисни „Принтирай / запази PDF“, а в прозореца за печат избери „Запази като PDF“ (има го във всеки съвременен браузър), мащаб 100% и без полета. Получаваш точен А4 файл, готов за прикачване към имейл или качване в сайт за работа.",
  },
];

const cvJsonLd = toolJsonLd({
  name: "Автобиография (CV)",
  path: "/cv",
  description: DESC,
  category: "BusinessApplication",
  howTo: HOWTO,
  faq: FAQ,
});

export default function CvPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display flex items-center gap-3 text-3xl font-bold sm:text-4xl">
          <Image src="/icons/cv.webp" alt="" width={56} height={56} unoptimized className="h-12 w-12 object-contain sm:h-14 sm:w-14" aria-hidden />
          Автобиография (CV)
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Попълни данните си стъпка по стъпка и виж готовото CV на живо —
          модерен, класически или <strong>Europass</strong> шаблон (единният
          формат на ЕС). Ако се затрудниш с текста — AI бутоните помагат.
          Накрая „Принтирай / запази PDF“ и си готов за кандидатстването.
          Данните остават само в твоя браузър.
        </p>
      </header>
      <CvStudio />
      <ToolFaq items={FAQ} heading="Въпроси за автобиографията" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(cvJsonLd) }}
      />
    </div>
  );
}
