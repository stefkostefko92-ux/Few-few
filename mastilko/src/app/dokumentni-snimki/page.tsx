import type { Metadata } from "next";
import Image from "next/image";
import PhotoStudio from "@/components/studios/PhotoStudio";
import ToolFaq, { type Faq } from "@/components/ToolFaq";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатни снимки за документи (35×45 mm)";
const DESC =
  "Направи снимки за лична карта, паспорт или виза у дома — качваш снимка, изрязваш по стандартния размер и печаташ цял лист еднакви снимки. Безплатно, изцяло в браузъра.";

const HOWTO = {
  name: "Как да си направиш снимки за документи",
  steps: [
    "Качи ясна снимка на лицето на равномерен светъл фон.",
    "Избери размера (БГ/ЕС 35×45 mm) и нагласи лицето с водача в рамката.",
    "Избери броя и принтирай на фотохартия; срежи по рамката.",
  ],
};

const FAQ: Faq[] = [
  {
    q: "Какъв размер са снимките за българска лична карта?",
    a: "Стандартът за България и ЕС е 35 × 45 mm. Инструментът има готови размери за БГ/ЕС документи, паспорт/виза за САЩ (51 × 51 mm) и по-малък 30 × 40 mm.",
  },
  {
    q: "Снимката ми качва ли се някъде?",
    a: "Не. Изрязването и подредбата стават изцяло в браузъра ти — снимката не се качва на сървър и не се изпраща никъде.",
  },
  {
    q: "Ще стане ли за официален документ?",
    a: "Инструментът ти дава верния размер и водач за лицето, но провери конкретните изисквания (размер на главата, фон, изражение) на съответния документ, преди да я подадеш.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "снимки за документи",
    "снимка за лична карта",
    "снимка за паспорт",
    "35x45 снимка",
    "снимка за виза",
    "биометрична снимка",
  ],
  alternates: { canonical: "/dokumentni-snimki" },
  ...pageMeta(TITLE, DESC, "/dokumentni-snimki"),
};

export default function DokumentniSnimkiPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display flex items-center gap-3 text-3xl font-bold sm:text-4xl">
          <Image src="/icons/cv.webp" alt="" width={56} height={56} unoptimized className="h-12 w-12 object-contain sm:h-14 sm:w-14" aria-hidden />
          Снимки за документи
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          <strong className="text-ink">Мастилко „Снимки за документи“ е безплатен инструмент за снимки за лична карта, паспорт и виза на български</strong>{" "}
          — качваш снимка, изрязваш по стандартния размер и печаташ цял лист.
          Всичко се обработва в браузъра ти — снимката не се качва никъде.
        </p>
      </header>
      <PhotoStudio />
      <ToolFaq items={FAQ} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolJsonLd({ name: "Снимки за документи", path: "/dokumentni-snimki", description: DESC, howTo: HOWTO, faq: FAQ }),
          ),
        }}
      />
    </div>
  );
}
