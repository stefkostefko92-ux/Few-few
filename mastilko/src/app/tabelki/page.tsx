import type { Metadata } from "next";
import TabelkaStudio from "@/components/studios/TabelkaStudio";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатни табелки и надписи за печат";
const DESC =
  "Направи табелка за печат — „Отворено/Затворено“, работно време, „Пази се от кучето“, надпис за врата. Готови заготовки, избираш цвят, принтираш на А4. Безплатно.";

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
  ...pageMeta(TITLE, DESC),
};

export default function TabelkiPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">🪧 Табелки и надписи</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          „Отворено/Затворено“, работно време, „Пази се от кучето“, надпис за
          врата на офис или кабинет. Избери готова заготовка или напиши свой
          текст, избери цвят и принтирай на А4.
        </p>
      </header>
      <TabelkaStudio />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolJsonLd({ name: "Табелки и надписи", path: "/tabelki", description: DESC }),
          ),
        }}
      />
    </div>
  );
}
