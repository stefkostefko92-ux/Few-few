import type { Metadata } from "next";
import Image from "next/image";
import LabelStudio from "@/components/studios/LabelStudio";
import ToolFaq, { type Faq } from "@/components/ToolFaq";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатни етикети за печат";
const DESC =
  "Създай етикети за буркани, кутии и продукти — избираш размер, цвят и текст, принтираш цял лист А4. Безплатно, на български, без регистрация.";

const HOWTO = {
  name: "Как да направиш етикети за печат",
  steps: [
    "Избери размер и форма (напр. 70×36 mm — 24 на лист) и топла цветова тема.",
    "Напиши текста — еднакъв за всички или списък (по един етикет на ред); по желание добави номерация или QR код с линк.",
    "Натисни „Принтирай / запази PDF“, избери мащаб 100% и без полета — листът А4 излиза с точни размери в милиметри.",
  ],
};

const FAQ: Faq[] = [
  {
    q: "Какви размери етикети мога да принтирам?",
    a: "11 стандартни размера за самозалепващи листове А4 — включително 70×36 mm (24 на лист), 63,5×38,1 mm (21 на лист), кръгли и овални. Избираш от менюто „Размер и форма“.",
  },
  {
    q: "Мога ли различен текст на всеки етикет?",
    a: "Да. В режим „Различни (списък)“ пишеш по един етикет на ред и всяка клетка получава своя текст; има и автоматична номерация.",
  },
  {
    q: "Как да позиционирам точно върху готови листове?",
    a: "Печатай на мащаб 100% без полета. Размерите са в милиметри и съвпадат с продаваните самозалепващи листове, за да не се разминават етикетите.",
  },
  {
    q: "Безплатно ли е и без воден знак?",
    a: "Да — напълно безплатно, без регистрация и без воден знак. Данните остават само в твоя браузър.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "етикети за печат",
    "безплатни етикети",
    "етикети за буркани",
    "етикети 70x36",
    "самозалепващи етикети А4",
    "етикети за подправки",
    "принтиране на етикети",
    "QR етикети",
  ],
  alternates: { canonical: "/etiketi" },
  ...pageMeta(TITLE, DESC, "/etiketi"),
};

export default function EtiketiPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display flex items-center gap-3 text-3xl font-bold sm:text-4xl">
          <Image src="/icons/etiketi.webp" alt="" width={56} height={56} unoptimized className="h-12 w-12 object-contain sm:h-14 sm:w-14" aria-hidden />
          Етикети за печат
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          <strong className="text-ink">Мастилко „Етикети“ е безплатен инструмент за етикети за печат на български</strong>{" "}
          — 11 стандартни размера за самозалепващи листове А4 (вкл. 70×36 mm,
          24 на лист, кръгли и овални), еднакъв текст или списък с автоматична
          номерация и QR код. За буркани със сладко, подправки, продукти за
          базар и инвентар. Напиши текста, избери тема и принтирай цял лист с
          точни размери в милиметри. Всичко се запазва само в твоя браузър.
        </p>
      </header>
      <LabelStudio />
      <ToolFaq items={FAQ} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolJsonLd({ name: "Етикети за печат", path: "/etiketi", description: DESC, howTo: HOWTO, faq: FAQ }),
          ),
        }}
      />
    </div>
  );
}
