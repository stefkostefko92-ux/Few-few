import type { Metadata } from "next";
import GramotaStudio from "@/components/studios/GramotaStudio";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатни грамоти и сертификати за печат";
const DESC =
  "Направи грамота, сертификат или диплома на български — красив хоризонтален А4 шаблон с рамка. За училища, детски градини, клубове и фирми. Безплатно, без регистрация.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "грамота образец",
    "грамота за печат",
    "сертификат шаблон",
    "диплома за печат",
    "благодарствено писмо",
    "грамота за ученик",
  ],
  alternates: { canonical: "/gramoti" },
  ...pageMeta(TITLE, DESC),
};

export default function GramotiPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">🏆 Грамоти и сертификати</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          За училища, детски градини, спортни клубове, читалища и фирми:
          попълни за кого е и за какво, избери цвят и принтирай красива грамота
          на хоризонтален А4. Данните остават само в твоя браузър.
        </p>
      </header>
      <GramotaStudio />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolJsonLd({ name: "Грамоти и сертификати", path: "/gramoti", description: DESC }),
          ),
        }}
      />
    </div>
  );
}
