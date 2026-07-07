import type { Metadata } from "next";
import LabelStudio from "@/components/studios/LabelStudio";

export const metadata: Metadata = {
  title: "Безплатни етикети за печат",
  description:
    "Създай етикети за буркани, кутии и продукти — избираш размер, цвят и текст, принтираш цял лист А4. Безплатно, на български, без регистрация.",
  alternates: { canonical: "/etiketi" },
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
    </div>
  );
}
