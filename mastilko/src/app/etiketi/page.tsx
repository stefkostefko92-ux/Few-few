import type { Metadata } from "next";
import LabelStudio from "@/components/studios/LabelStudio";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатни етикети за печат";
const DESC =
  "Създай етикети за буркани, кутии и продукти — избираш размер, цвят и текст, принтираш цял лист А4. Безплатно, на български, без регистрация.";

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
  ...pageMeta(TITLE, DESC),
};

export default function EtiketiPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          🏷️ Етикети за печат
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          За буркани със сладко, кутии с подправки, тетрадки, продукти за
          базар… Напиши текста, избери топла тема и принтирай цял лист.
          Всичко се запазва само в твоя браузър.
        </p>
      </header>
      <LabelStudio />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolJsonLd({ name: "Етикети за печат", path: "/etiketi", description: DESC }),
          ),
        }}
      />
    </div>
  );
}
