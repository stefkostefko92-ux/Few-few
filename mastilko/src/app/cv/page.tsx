import type { Metadata } from "next";
import CvStudio from "@/components/studios/CvStudio";

export const metadata: Metadata = {
  title: "Безплатна автобиография (CV) на български",
  description:
    "Създай чиста, професионална автобиография на български — попълваш стъпка по стъпка, AI помага с описанията, запазваш като PDF. Безплатно и без регистрация.",
  alternates: { canonical: "/cv" },
};

export default function CvPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          📄 Автобиография (CV)
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Попълни данните си стъпка по стъпка и виж готовото CV на живо.
          Ако се затрудниш с текста — AI бутоните помагат. Накрая „Принтирай /
          запази PDF“ и си готов за кандидатстването. Данните остават само в
          твоя браузър.
        </p>
      </header>
      <CvStudio />
    </div>
  );
}
