import type { Metadata } from "next";
import TabelkaStudio from "@/components/studios/TabelkaStudio";
import ToolFaq, { type Faq } from "@/components/ToolFaq";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатни табелки и надписи за печат";
const DESC =
  "Направи табелка за печат — „Отворено/Затворено“, работно време, „Пази се от кучето“, надпис за врата. Готови заготовки, избираш цвят, принтираш на А4. Безплатно.";

const HOWTO = {
  name: "Как да направиш табелка",
  steps: [
    "Избери готова заготовка („Отворено/Затворено“, работно време, „Пази се от кучето“…) или напиши свой текст.",
    "Избери цвят и шрифт.",
    "Принтирай на А4; за трайност ламинирай или сложи в прозрачен джоб.",
  ],
};

const FAQ: Faq[] = [
  {
    q: "Какви табелки мога да направя?",
    a: "„Отворено/Затворено“, работно време, „Пази се от кучето“, „Не пуши“, надпис за врата на офис или кабинет — както и всякакъв свой текст.",
  },
  {
    q: "Как да е трайна табелката?",
    a: "Принтирай на по-плътна хартия и ламинирай, или сложи в прозрачен джоб/файл — така издържа на допир и влага.",
  },
  {
    q: "Мога ли свой текст, цвят и шрифт?",
    a: "Да — всичко се редактира: текстът, цветовете и шрифтът (над 60 шрифта с кирилица).",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "табелка за печат",
    "надпис отворено затворено",
    "табелка работно време",
    "табела за врата",
    "пази се от кучето табелка",
    "надпис за печат",
  ],
  alternates: { canonical: "/tabelki" },
  ...pageMeta(TITLE, DESC, "/tabelki"),
};

export default function TabelkiPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">🪧 Табелки и надписи</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          <strong className="text-ink">Мастилко „Табелки“ е безплатен инструмент за табелки и надписи за печат на български</strong>{" "}
          — готови заготовки „Отворено/Затворено“, работно време, „Пази се от
          кучето“ и надпис за врата на офис или кабинет. Избери заготовка или
          напиши свой текст, избери цвят и шрифт и принтирай на А4.
        </p>
      </header>
      <TabelkaStudio />
      <ToolFaq items={FAQ} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolJsonLd({ name: "Табелки и надписи", path: "/tabelki", description: DESC, howTo: HOWTO, faq: FAQ }),
          ),
        }}
      />
    </div>
  );
}
