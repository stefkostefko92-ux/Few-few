import type { Metadata } from "next";
import { buildMetadata, webPageLd, faqPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { FaqList, Callout, Sources } from "@/components/content";
import { EuroConverter } from "@/components/EuroConverter";

export const metadata: Metadata = buildMetadata({
  title: "Всичко за еврото",
  description:
    "Какво се променя с въвеждането на еврото в България: фиксиран курс, двойно обозначаване на цените, обмяна на левове. Прости отговори за всички възрасти.",
  path: "/evroto",
});

const FIXED_RATE = "1 евро = 1,95583 лева";

const FAQS: { q: string; a: string }[] = [
  {
    q: "По какъв курс се обменят левовете в евро?",
    a: `По фиксирания официален курс: ${FIXED_RATE}. Този курс е един и същ навсякъде и не се променя.`,
  },
  {
    q: "Ще загубят ли стойност спестяванията ми в левове?",
    a: "Не. Сумите се преизчисляват по фиксирания курс. Това, което имате, запазва стойността си — сменя се само валутата, в която е изразено.",
  },
  {
    q: "Трябва ли да бързам да обменям парите си в брой?",
    a: "Не е нужно да бързате. В началния период цените се обозначават едновременно в левове и в евро, а банките обменят банкноти и монети по фиксирания курс. Парите по сметка се преизчисляват автоматично.",
  },
  {
    q: "Ще се вдигнат ли цените?",
    a: "Самата смяна на валутата не променя стойността на стоките. Двойното обозначаване на цените (в левове и в евро) служи точно за да можете да сравнявате и да забележите неоправдано закръгляне.",
  },
  {
    q: "Как да не се подведа от измама покрай еврото?",
    a: "Никой служител няма да иска да „смените“ парите си по телефона или да ги дадете на куриер. При такова обаждание затворете и се обадете на близък. Вижте и раздел „Пази се от измами“.",
  },
];

export default function EvrotoPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageLd({ name: "Всичко за еврото", path: "/evroto", type: "FAQPage" }),
          faqPageLd(
            FAQS.map((f) => ({ question: f.q, answerText: f.a })),
            "/evroto",
          ),
        ]}
      />
      <PageHero
        eyebrow="Пари"
        title="Всичко за еврото"
        intro="Прости отговори за това какво се променя и какво — не, когато България ползва еврото."
        crumbs={[{ name: "Еврото", path: "/evroto" }]}
      />

      <div className="container-content py-10">
        <div className="rounded-2xl border border-gold-300 bg-gold-50 p-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-gold-700">
            Фиксиран курс
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold text-slate-900">
            {FIXED_RATE}
          </p>
        </div>

        <h2 className="section-title mb-5 mt-10">Калкулатор лев ⇄ евро</h2>
        <EuroConverter />

        <h2 className="section-title mb-5 mt-10">Често задавани въпроси</h2>
        <FaqList items={FAQS.map((f) => ({ q: f.q, a: f.a }))} />

        <Callout tone="info">
          За официална и най-актуална информация (срокове и правила) проверявайте
          официалния портал за еврото и Българската народна банка.
        </Callout>

        <Sources
          items={[
            { label: "Официален портал за еврото", url: "https://evroto.bg/" },
            { label: "Българска народна банка", url: "https://www.bnb.bg/" },
          ]}
        />
      </div>
    </>
  );
}
