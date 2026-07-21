import type { Metadata } from "next";
import Image from "next/image";
import BadgeStudio from "@/components/studios/BadgeStudio";
import ToolFaq, { type Faq } from "@/components/ToolFaq";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатни баджове за събития (name tags)";
const DESC =
  "Направи баджове за конференция, семинар или сватба — цял списък гости наведнъж от таблица. Име, роля, фирма, лого и QR код. Готово за печат, безплатно, на български.";

const HOWTO = {
  name: "Как да направиш баджове за събитие",
  steps: [
    "Въведи името на събитието и (по избор) качи лого.",
    "Постави списъка с гости — по един на ред във формат „Име | роля | фирма“.",
    "Избери размер и тема, виж всички баджове на живо и принтирай листовете А4.",
  ],
};

const FAQ: Faq[] = [
  {
    q: "Мога ли да направя баджове за цял списък гости наведнъж?",
    a: "Да. Постави списъка в полето „Списък гости“ — по един ред на човек. Мастилко подрежда баджовете на листове А4 автоматично. Това е функцията за серийна изработка (mail-merge), която другаде обикновено е платена.",
  },
  {
    q: "Данните на гостите изпращат ли се някъде?",
    a: "Не. Целият списък и баджовете се създават изцяло в браузъра ти — нямаме база данни и нищо не се качва на сървър.",
  },
  {
    q: "Какъв размер са баджовете?",
    a: "Избираш между стандартен (90 × 55 mm, като джоб на ланярд) и голям (100 × 70 mm). Размерите се печатат точно в милиметри.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "баджове за събития",
    "name tags",
    "баджове за конференция",
    "табелки с имена",
    "баджове за печат",
    "ланярд бадж",
  ],
  alternates: { canonical: "/badzhove" },
  ...pageMeta(TITLE, DESC, "/badzhove"),
};

export default function BadzhovePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display flex items-center gap-3 text-3xl font-bold sm:text-4xl">
          <Image src="/icons/vizitki.webp" alt="" width={56} height={56} unoptimized className="h-12 w-12 object-contain sm:h-14 sm:w-14" aria-hidden />
          Баджове за събития
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          <strong className="text-ink">Мастилко „Баджове“ е безплатен инструмент за баджове за конференции и събития на български</strong>{" "}
          — направи цял списък гости наведнъж (серийна изработка от таблица), с
          име, роля, фирма, лого и QR код. Всичко се създава в браузъра ти —
          списъкът с гости не напуска устройството.
        </p>
      </header>
      <BadgeStudio />
      <ToolFaq items={FAQ} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolJsonLd({ name: "Баджове за събития", path: "/badzhove", description: DESC, howTo: HOWTO, faq: FAQ }),
          ),
        }}
      />
    </div>
  );
}
