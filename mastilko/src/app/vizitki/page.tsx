import type { Metadata } from "next";
import Image from "next/image";
import CardStudio from "@/components/studios/CardStudio";
import ToolFaq, { type Faq } from "@/components/ToolFaq";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатни визитки онлайн";
const DESC =
  "Направи си визитки 90 × 54 mm с топъл дизайн — шест шаблона, 10 на лист А4, готови за рязане. Безплатно, на български, без регистрация и без воден знак.";

const HOWTO = {
  name: "Как да си направиш визитки",
  steps: [
    "Избери шаблон (лента, класик, линия, рамка, горна лента или дуо) и топла цветова тема.",
    "Попълни име, длъжност, телефон и имейл; по желание добави QR код с контактите (vCard).",
    "Принтирай 10 визитки на лист А4 на мащаб 100% без полета и изрежи по линиите.",
  ],
};

const FAQ: Faq[] = [
  {
    q: "Какъв е стандартният размер на визитка?",
    a: "Мастилко ползва 90 × 54 mm — размерът, който се използва в България и се събира точно 10 визитки на лист А4. Близък е до международните 85 × 55 mm.",
  },
  {
    q: "Мога ли да сложа QR код с контактите?",
    a: "Да. Включваш vCard QR код — при сканиране с камерата контактът (име, телефон, имейл) влиза направо в телефона на човека.",
  },
  {
    q: "На каква хартия да принтирам визитки?",
    a: "За издръжливи визитки ползвай картон 250–300 г/м². Печатай на мащаб 100% без полета и режи по пунктираните линии.",
  },
  {
    q: "Безплатно ли е и без воден знак?",
    a: "Да — напълно безплатно, без регистрация и без воден знак.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "визитки онлайн",
    "безплатни визитки",
    "визитки за печат",
    "направи визитка",
    "визитки с QR код",
    "визитка vCard",
    "шаблони за визитки",
    "визитки 90x54",
  ],
  alternates: { canonical: "/vizitki" },
  ...pageMeta(TITLE, DESC, "/vizitki"),
};

export default function VizitkiPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display flex items-center gap-3 text-3xl font-bold sm:text-4xl">
          <Image src="/icons/vizitki.webp" alt="" width={56} height={56} unoptimized className="h-12 w-12 object-contain sm:h-14 sm:w-14" aria-hidden />
          Визитки
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          <strong className="text-ink">Мастилко „Визитки“ е безплатен инструмент за визитки за печат на български</strong>{" "}
          — стандартен размер 90 × 54 mm, шест шаблона и топли цветови теми, 10
          визитки на лист А4 с линии за рязане. По желание добавяш QR код с
          контактите (vCard). Попълни данните си, виж визитката на живо и
          принтирай — без регистрация и без воден знак.
        </p>
      </header>
      <CardStudio />
      <ToolFaq items={FAQ} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolJsonLd({ name: "Визитки", path: "/vizitki", description: DESC, howTo: HOWTO, faq: FAQ }),
          ),
        }}
      />
    </div>
  );
}
