import type { Metadata } from "next";
import PokanaStudio from "@/components/studios/PokanaStudio";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатни покани за печат";
const DESC =
  "Направи покана за рожден ден, кръщене, сватба или юбилей — топъл шаблон, 2 на лист А4, готови за рязане. Безплатно, на български, без регистрация.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "покана за рожден ден",
    "покани за печат",
    "покана за кръщене",
    "покана за сватба",
    "детска покана шаблон",
    "покана образец",
  ],
  alternates: { canonical: "/pokani" },
  ...pageMeta(TITLE, DESC),
};

export default function PokaniPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">🎉 Покани и картички</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          За рожден ден, кръщене, сватба или юбилей: избери повод, попълни кога
          и къде и принтирай две покани на лист А4. Данните остават само в твоя
          браузър.
        </p>
      </header>
      <PokanaStudio />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolJsonLd({ name: "Покани и картички", path: "/pokani", description: DESC }),
          ),
        }}
      />
    </div>
  );
}
