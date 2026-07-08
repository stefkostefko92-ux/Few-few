import type { Metadata } from "next";
import PismoStudio from "@/components/studios/PismoStudio";

export const metadata: Metadata = {
  title: "Безплатно мотивационно писмо на български",
  description:
    "Напиши мотивационно писмо за кандидатстване за работа — чист шаблон, AI чернова с Gemini, печат или PDF. Безплатно, на български, без регистрация.",
  keywords: [
    "мотивационно писмо",
    "мотивационно писмо образец",
    "мотивационно писмо за работа",
    "как да напиша мотивационно писмо",
    "придружително писмо",
    "мотивационно писмо шаблон",
  ],
  alternates: { canonical: "/pismo" },
  openGraph: { title: "Безплатно мотивационно писмо на български" },
};

export default function PismoPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          ✉️ Мотивационно писмо
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Най-трудната част от кандидатстването — по-лесна: попълни за коя
          позиция кандидатстваш, кажи 2–3 неща за себе си и AI пише чернова,
          която правиш своя. Върви си с <a className="font-semibold text-tera-dark underline" href="/cv">CV-то</a>.
          Данните остават само в твоя браузър.
        </p>
      </header>
      <PismoStudio />
    </div>
  );
}
