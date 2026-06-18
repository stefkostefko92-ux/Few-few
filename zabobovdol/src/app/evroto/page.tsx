import Link from "next/link";
import type { Metadata } from "next";
import { Euro, AlertTriangle, CalendarClock, Coins, Landmark } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHero, Prose, EmptyState } from "@/components/ui";
import { buildMetadata, faqPageLd } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { JsonLd } from "@/components/JsonLd";
import { PrintButton } from "@/components/PrintButton";
import { EuroConverter } from "@/components/EuroConverter";

export const dynamic = "force-dynamic";

const CATEGORY = "Еврото";

export const metadata: Metadata = buildMetadata({
  title: "Всичко за еврото в България — 35 въпроса и отговори",
  description:
    "Ясно и просто за приемането на еврото в България: курс 1 евро = 1.95583 лева, дати, обмяна на левове, цени, пенсии, банкови сметки и как да се пазите от измами. Проверена информация.",
  path: "/evroto",
});

const FACTS: { icon: typeof Euro; title: string; text: string }[] = [
  { icon: CalendarClock, title: "Кога", text: "Еврото става официална валута от 1 януари 2026 г." },
  { icon: Euro, title: "Курс", text: "Фиксиран: 1 евро = 1.95583 лева — за всичко." },
  { icon: Coins, title: "Левове в брой", text: "Плащане с левове до 31 януари 2026 г.; после само евро." },
  { icon: Landmark, title: "Обмяна", text: "Безплатно в банки и пощи до 30 юни 2026 г.; в БНБ — безсрочно." },
];

export default async function EuroPage() {
  const items = await prisma.faq.findMany({
    where: { published: true, category: CATEGORY },
    orderBy: { order: "asc" },
  });

  return (
    <>
      {items.length > 0 && (
        <JsonLd
          data={faqPageLd(
            items.map((i) => ({ question: i.question, answerText: plainText(i.answer, 300) })),
          )}
        />
      )}

      <PageHero
        eyebrow="Еврото в България"
        title="Всичко за еврото — въпроси и отговори"
        intro="Просто и спокойно за смяната на лева с евро: какво се случва с парите, пенсиите и цените, как се обменят левовете и как да се пазите от измами. Информацията е по официални източници."
        crumbs={[{ name: "Еврото", path: "/evroto" }]}
      />

      <div className="container-content space-y-10 py-10">
        {/* Ключови факти */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-xl border border-brand-200 bg-brand-50 p-5">
                <Icon className="h-7 w-7 text-brand-700" aria-hidden />
                <div className="mt-2 font-display text-lg font-bold text-slate-900">{f.title}</div>
                <p className="mt-1 text-sm text-slate-700">{f.text}</p>
              </div>
            );
          })}
        </section>

        {/* Конвертор евро ↔ левове */}
        <EuroConverter />

        {/* Предупреждение за измами */}
        <section className="rounded-2xl border border-crimson-200 bg-crimson-50 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-crimson-700" aria-hidden />
            <div>
              <h2 className="text-xl font-bold text-slate-900">Внимавайте с измамите около еврото</h2>
              <p className="mt-1 text-slate-700">
                Никой от банка или държава НЕ идва вкъщи и НЕ звъни по телефона да „обменя“
                или „проверява“ левовете ви. Това е измама. Обмяната става само на гише
                (банка, поща, БНБ). При такъв човек — затворете вратата/телефона и звъннете
                на близък. Вижте и{" "}
                <Link href="/izmami" className="font-medium text-crimson-700 underline">
                  „Пази се от измами“
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        {/* Въпроси и отговори */}
        <section>
          <h2 className="section-title mb-5">Често задавани въпроси</h2>
          {items.length === 0 ? (
            <EmptyState title="Скоро тук ще добавим въпросите за еврото." />
          ) : (
            <div className="space-y-4">
              {items.map((i, idx) => (
                <article
                  key={i.id}
                  id={i.slug}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <h3 className="flex gap-2 font-display text-lg font-bold text-slate-900">
                    <span className="text-brand-600">{idx + 1}.</span>
                    {i.question}
                  </h3>
                  <div className="mt-2">
                    <Prose html={renderMarkdown(i.answer)} />
                  </div>
                  {i.steps && (
                    <ol className="mt-3 space-y-1.5">
                      {i.steps.split("\n").filter(Boolean).map((s, k) => (
                        <li key={k} className="flex gap-2 text-slate-700">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                            {k + 1}
                          </span>
                          <span className="pt-0.5">{s}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Печат + източници */}
        <section className="no-print">
          <PrintButton variant="secondary" label="Принтирай тази страница" />
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          <div className="font-semibold text-slate-800">Официални източници (за проверка):</div>
          <ul className="mt-2 space-y-1">
            <li>
              Българска народна банка —{" "}
              <a href="https://www.bnb.bg" target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                bnb.bg
              </a>
            </li>
            <li>
              Официален портал за еврото —{" "}
              <a href="https://evroto.bg" target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                evroto.bg
              </a>
            </li>
            <li>
              Комисия за защита на потребителите —{" "}
              <a href="https://kzp.bg" target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                kzp.bg
              </a>
            </li>
          </ul>
          <p className="mt-3">
            Сроковете и детайлите може да се променят. За конкретни въпроси за вашата
            сметка питайте във вашата банка.
          </p>
        </section>
      </div>
    </>
  );
}
