import type { Metadata } from "next";
import Image from "next/image";
import MenuStudio from "@/components/studios/MenuStudio";
import ToolFaq, { type Faq } from "@/components/ToolFaq";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатно меню и ценоразпис за печат";
const DESC =
  "Направи меню или ценоразпис за кафене, бар или ресторант — раздели, продукти и цени, готово за печат на А4. Бързо, безплатно, на български.";

const HOWTO = {
  name: "Как да направиш меню за печат",
  steps: [
    "Въведи името на заведението и валутата.",
    "Напиши разделите (с „## Име“) и продуктите (с „Продукт | цена“).",
    "Избери тема и принтирай листа А4 за масите или витрината.",
  ],
};

const FAQ: Faq[] = [
  {
    q: "За какво става менюто?",
    a: "За кафенета, барове, ресторанти, сладкарници и всеки малък бизнес, който иска бърз ценоразпис на масата или витрината.",
  },
  {
    q: "Как се добавят раздели и цени?",
    a: "На нов ред пишеш „## Кафе“ за раздел, а после „Еспресо | 2.00“ за продукт с цена. Между името и цената се появява точкова линия.",
  },
  {
    q: "Данните ми къде отиват?",
    a: "Никъде. Менюто се създава изцяло в браузъра ти — нямаме база данни и нищо не се качва на сървър.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "меню за печат",
    "ценоразпис",
    "меню за кафене",
    "меню за ресторант",
    "ценоразпис за печат",
    "меню шаблон",
  ],
  alternates: { canonical: "/menu" },
  ...pageMeta(TITLE, DESC, "/menu"),
};

export default function MenuPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display flex items-center gap-3 text-3xl font-bold sm:text-4xl">
          <Image src="/icons/etiketi.webp" alt="" width={56} height={56} unoptimized className="h-12 w-12 object-contain sm:h-14 sm:w-14" aria-hidden />
          Меню и ценоразпис
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          <strong className="text-ink">Мастилко „Меню“ е безплатен инструмент за меню и ценоразпис за печат на български</strong>{" "}
          — раздели, продукти и цени с точкова линия, готово за А4. За кафенета,
          барове и ресторанти. Всичко се създава в браузъра ти.
        </p>
      </header>
      <MenuStudio />
      <ToolFaq items={FAQ} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolJsonLd({ name: "Меню и ценоразпис", path: "/menu", description: DESC, howTo: HOWTO, faq: FAQ }),
          ),
        }}
      />
    </div>
  );
}
