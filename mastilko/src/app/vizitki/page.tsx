import type { Metadata } from "next";
import CardStudio from "@/components/studios/CardStudio";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатни визитки онлайн";
const DESC =
  "Направи си визитки 90 × 54 mm с топъл дизайн — шест шаблона, 10 на лист А4, готови за рязане. Безплатно, на български, без регистрация и без воден знак.";

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
  ...pageMeta(TITLE, DESC),
};

export default function VizitkiPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          💼 Визитки
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Стандартен размер 90 × 54 mm, шест шаблона и топли цветови теми.
          Попълни данните си, виж визитката на живо и принтирай 10 наведнъж
          на лист А4.
        </p>
      </header>
      <CardStudio />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolJsonLd({ name: "Визитки", path: "/vizitki", description: DESC }),
          ),
        }}
      />
    </div>
  );
}
