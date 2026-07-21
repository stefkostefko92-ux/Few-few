import type { Metadata } from "next";
import Image from "next/image";
import VoucherStudio from "@/components/studios/VoucherStudio";
import ToolFaq, { type Faq } from "@/components/ToolFaq";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатни подаръчни ваучери и талони за отстъпка";
const DESC =
  "Направи подаръчни ваучери и талони за отстъпка с уникален код и QR — за салон, кафене, магазин. Цяла серия наведнъж, готови за печат. Безплатно, на български.";

const HOWTO = {
  name: "Как да направиш подаръчни ваучери",
  steps: [
    "Въведи бизнеса, стойността (напр. −20% или „Подарък“) и валидността.",
    "Задай префикс на кода и брой ваучери — всеки получава уникален номер.",
    "Принтирай листовете А4, срежи по пунктира и раздавай ваучерите.",
  ],
};

const FAQ: Faq[] = [
  {
    q: "Всеки ваучер уникален ли е?",
    a: "Да. Задаваш префикс и брой, а всеки ваучер получава пореден уникален код (напр. MECHTA-001, MECHTA-002…), за да ги следиш при осребряване.",
  },
  {
    q: "Мога ли да добавя QR код?",
    a: "Да — може да сложиш общ QR с линк към сайта или страницата за осребряване. Генерира се изцяло в браузъра ти.",
  },
  {
    q: "Данните ми къде отиват?",
    a: "Никъде. Ваучерите се създават в браузъра ти — нямаме база данни и нищо не се качва на сървър.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "подаръчен ваучер",
    "талон за отстъпка",
    "ваучер за печат",
    "купон за отстъпка",
    "gift voucher българия",
    "ваучер за салон",
  ],
  alternates: { canonical: "/vaucheri" },
  ...pageMeta(TITLE, DESC, "/vaucheri"),
};

export default function VaucheriPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display flex items-center gap-3 text-3xl font-bold sm:text-4xl">
          <Image src="/icons/pokani.webp" alt="" width={56} height={56} unoptimized className="h-12 w-12 object-contain sm:h-14 sm:w-14" aria-hidden />
          Подаръчни ваучери и талони
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          <strong className="text-ink">Мастилко „Ваучери“ е безплатен инструмент за подаръчни ваучери и талони за отстъпка на български</strong>{" "}
          — с уникален код и QR, цяла серия наведнъж. За салони, кафенета и
          магазини. Всичко се създава в браузъра ти.
        </p>
      </header>
      <VoucherStudio />
      <ToolFaq items={FAQ} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolJsonLd({ name: "Подаръчни ваучери и талони", path: "/vaucheri", description: DESC, howTo: HOWTO, faq: FAQ }),
          ),
        }}
      />
    </div>
  );
}
