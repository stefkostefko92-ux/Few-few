import Link from "next/link";
import type { Metadata } from "next";
import { CalendarClock, Coins, Info, Landmark } from "@/components/icons";
import { ArticleActions, PageHero, SectionHeader } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { TaxEstimator } from "@/components/TaxEstimator";
import { PrintSourceLine } from "@/components/PrintSourceLine";
import { formatDate, isoDate } from "@/lib/format-date";
import { daysLeftLabel, deadlineStatuses } from "@/lib/tax-deadlines";
import { SECTION } from "@/lib/section-names";

// „Следващ срок · след N дни“ зависи от днешния ден по софийско време — при
// кеш за час около полунощ пишеше „утре“ за днешния срок. Затова при всяка
// заявка, както другите страници с „днес“.
export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Данъци и срокове — кога и как да платите",
  description:
    "Срокове за местните данъци и такси (данък сгради, такса смет, данък МПС), отстъпка за ранно плащане и къде да платите. Ориентировъчен калкулатор в евро.",
  path: "/danaci-srokove",
  keywords: [
    "местни данъци Бобов дол",
    "данък сгради срок",
    "такса смет срок",
    "данък МПС 2026",
    "отстъпка 5% данъци",
    "къде да платя данъци",
    "Carbon Stealth",
  ],
});

const PAY_WAYS: { title: string; text: string }[] = [
  {
    title: "Онлайн",
    text: "През egov.bg или сайта на НАП/общината — с ПИК, електронен подпис или карта.",
  },
  {
    title: "На каса",
    text: "В EasyPay, на пощата или в банка — носете съобщението или ЕГН/партиден номер.",
  },
  {
    title: "В общината",
    text: "На гише „Местни данъци и такси“ — в брой или с карта.",
  },
];

export default function TaxDeadlinesPage() {
  const today = isoDate(new Date());
  const deadlines = deadlineStatuses(today);

  return (
    <>
      <PageHero
        eyebrow={SECTION.money}
        title="Данъци и срокове"
        intro="Кога се плащат местните данъци и такси, как да спестите с ранно плащане и къде да платите."
        crumbs={[{ name: "Данъци и срокове", path: "/danaci-srokove" }]}
      />

      <div className="container-content space-y-12 py-10">
        <section aria-labelledby="srokove" className="max-w-3xl">
          <SectionHeader
            id="srokove"
            title={
              <span className="inline-flex items-center gap-2">
                <CalendarClock className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
                Важни срокове през годината
              </span>
            }
          />
          <ul role="list" className="space-y-3">
            {deadlines.map((d) => (
              <li
                key={d.label}
                className={`flex flex-col gap-1 rounded-2xl border p-4 sm:flex-row sm:gap-4 ${
                  d.next ? "border-gold-300 bg-gold-50" : "border-slate-200 bg-white"
                }`}
              >
                <div
                  className={`shrink-0 whitespace-nowrap font-bold sm:w-40 ${
                    d.passed ? "text-slate-600" : "text-brand-800"
                  }`}
                >
                  {/* Изтеклият срок е тазгодишният, не следващата година. */}
                  <time
                    dateTime={
                      d.passed
                        ? `${today.slice(0, 4)}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
                        : d.nextIso
                    }
                  >
                    {d.label}
                  </time>
                </div>
                <div className="min-w-0">
                  {d.next && (
                    <p className="mb-1">
                      <span className="badge-warning">
                        Следващ срок · {daysLeftLabel(d.daysLeft)}
                        {d.nextIso.slice(0, 4) !== today.slice(0, 4) &&
                          ` (${formatDate(`${d.nextIso}T12:00:00Z`)})`}
                      </span>
                    </p>
                  )}
                  {d.passed && (
                    <p className="mb-1">
                      <span className="badge-neutral">Изтекъл за {today.slice(0, 4)}&nbsp;г.</span>
                    </p>
                  )}
                  <p className={d.passed ? "text-base text-slate-600" : "text-base text-slate-800"}>
                    {d.what}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-start gap-2 text-base text-slate-600">
            <Info className="mt-1 h-5 w-5 shrink-0 text-slate-600" aria-hidden />
            <span>
              Сроковете са общите по закон. При промяна се водете по съобщението от данъчната
              служба.
            </span>
          </p>
        </section>

        <section aria-labelledby="kolko" className="max-w-3xl">
          <SectionHeader
            id="kolko"
            title={
              <span className="inline-flex items-center gap-2">
                <Coins className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
                Колко ще платите?
              </span>
            }
          />
          <TaxEstimator />
        </section>

        <section aria-labelledby="kade">
          <SectionHeader
            id="kade"
            title={
              <span className="inline-flex items-center gap-2">
                <Landmark className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
                Къде да платите
              </span>
            }
          />
          <ul role="list" className="grid gap-4 sm:grid-cols-3">
            {PAY_WAYS.map((p) => (
              <li key={p.title} className="panel h-full">
                <h3 className="h-card">{p.title}</h3>
                <p className="mt-1 text-base text-slate-700">{p.text}</p>
              </li>
            ))}
          </ul>
          <p className="mt-5 max-w-3xl text-base text-slate-700">
            Не знаете как? Вижте стъпка по стъпка в{" "}
            <Link href="/kak-da" className="link">
              ръководствата „Как да…“
            </Link>{" "}
            или страницата{" "}
            <Link href="/pomoshti" className="link">
              „Пенсии и помощи“
            </Link>
            .
          </p>
        </section>

        <div className="max-w-3xl">
          <ArticleActions
            className="!mt-0"
            shareTitle="Данъци и срокове — За Бобов дол"
            shareText="Кога се плащат местните данъци и такси и как да спестите 5%."
            sharePath="/danaci-srokove"
          />
          <PrintSourceLine path="/danaci-srokove" />
        </div>
      </div>
    </>
  );
}
