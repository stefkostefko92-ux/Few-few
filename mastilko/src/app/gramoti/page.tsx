import type { Metadata } from "next";
import Image from "next/image";
import GramotaStudio from "@/components/studios/GramotaStudio";
import ToolFaq, { type Faq } from "@/components/ToolFaq";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатни грамоти и сертификати за печат";
const DESC =
  "Направи грамота, сертификат или диплома на български — красив хоризонтален А4 шаблон с рамка. За училища, детски градини, клубове и фирми. Безплатно, без регистрация.";

const HOWTO = {
  name: "Как да направиш грамота",
  steps: [
    "Избери повод и цветова рамка.",
    "Попълни заглавието (Грамота / Сертификат), името на получателя, за какво се връчва, дата и подпис.",
    "Принтирай на хоризонтален А4 на мащаб 100%.",
  ],
};

const FAQ: Faq[] = [
  {
    q: "За какво се използват грамотите?",
    a: "За награждаване и признание — на ученици, спортисти, служители и доброволци, в училища, детски градини, спортни клубове, читалища и фирми.",
  },
  {
    q: "Мога ли да сменя надписа „Грамота“ на „Сертификат“?",
    a: "Да — заглавието се редактира свободно: грамота, сертификат, диплома или благодарствено писмо.",
  },
  {
    q: "В какъв формат се печата грамотата?",
    a: "Хоризонтален (landscape) А4. Мастилко подрежда листа автоматично — печатай на мащаб 100%.",
  },
];

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
  ...pageMeta(TITLE, DESC, "/gramoti"),
};

export default function GramotiPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display flex items-center gap-3 text-3xl font-bold sm:text-4xl">
          <Image src="/icons/gramoti.png" alt="" width={56} height={56} unoptimized className="h-12 w-12 object-contain sm:h-14 sm:w-14" aria-hidden />
          Грамоти и сертификати
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          <strong className="text-ink">Мастилко „Грамоти“ е безплатен инструмент за грамоти и сертификати за печат на български</strong>{" "}
          — красив хоризонтален А4 шаблон с рамка за училища, детски градини,
          спортни клубове, читалища и фирми. Заглавието се сменя на грамота,
          сертификат, диплома или благодарствено писмо. Попълни за кого е и за
          какво, избери цвят и принтирай. Данните остават само в твоя браузър.
        </p>
      </header>
      <GramotaStudio />
      <ToolFaq items={FAQ} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolJsonLd({ name: "Грамоти и сертификати", path: "/gramoti", description: DESC, howTo: HOWTO, faq: FAQ }),
          ),
        }}
      />
    </div>
  );
}
