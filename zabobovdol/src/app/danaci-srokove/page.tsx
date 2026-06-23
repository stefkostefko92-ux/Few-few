import Link from "next/link";
import type { Metadata } from "next";
import { CalendarClock, Coins, Info, Landmark } from "@/components/icons";
import { PageHero } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { TaxEstimator } from "@/components/TaxEstimator";

export const metadata: Metadata = buildMetadata({
  title: "Данъци и срокове — кога и как да платя",
  description:
    "Срокове за местните данъци и такси (данък сгради, такса смет, данък МПС), отстъпка за ранно плащане и къде да платите. Ориентировъчен калкулатор.",
  path: "/danaci-srokove",
});

const DEADLINES: { when: string; what: string; highlight?: boolean }[] = [
  {
    when: "до 30 април",
    what: "5% отстъпка при плащане на целия годишен данък наведнъж (за данък сгради, такса смет и данък МПС).",
    highlight: true,
  },
  { when: "до 30 юни", what: "Първа вноска на данък сгради, такса битови отпадъци и данък върху превозните средства." },
  { when: "до 31 октомври", what: "Втора (последна) вноска на същите данъци и такси." },
];

const PAY_WAYS: { title: string; text: string }[] = [
  { title: "Онлайн", text: "През egov.bg или сайта на НАП/общината — с ПИК, електронен подпис или карта." },
  { title: "На каса", text: "В EasyPay, на пощата или в банка — носете съобщението или ЕГН/партиден номер." },
  { title: "В общината", text: "На гише „Местни данъци и такси“ — в брой или с карта." },
];

export default function TaxDeadlinesPage() {
  return (
    <>
      <PageHero
        eyebrow="Пари и документи"
        title="Данъци и срокове"
        intro="Кога се плащат местните данъци и такси, как да спестите с ранно плащане и къде да платите."
        crumbs={[{ name: "Данъци и срокове", path: "/danaci-srokove" }]}
      />

      <div className="container-content space-y-10 py-10">
        <section>
          <h2 className="section-title mb-5 flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-brand-700" aria-hidden />
            Важни срокове през годината
          </h2>
          <ul className="space-y-3">
            {DEADLINES.map((d) => (
              <li
                key={d.when}
                className={`flex gap-4 rounded-xl border p-4 ${
                  d.highlight ? "border-gold-300 bg-gold-50" : "border-slate-200 bg-white"
                }`}
              >
                <div className="w-28 shrink-0 font-bold text-brand-800">{d.when}</div>
                <div className="text-slate-700">{d.what}</div>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-start gap-2 text-sm text-slate-500">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" aria-hidden />
            <span>
              Сроковете са общите по закон. При промяна се водете по съобщението от данъчната
              служба.
            </span>
          </p>
        </section>

        <section>
          <h2 className="section-title mb-5 flex items-center gap-2">
            <Coins className="h-6 w-6 text-brand-700" aria-hidden />
            Колко ще платя?
          </h2>
          <TaxEstimator />
        </section>

        <section>
          <h2 className="section-title mb-5 flex items-center gap-2">
            <Landmark className="h-6 w-6 text-brand-700" aria-hidden />
            Къде да платя
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {PAY_WAYS.map((p) => (
              <div key={p.title} className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="font-bold text-slate-900">{p.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{p.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm text-slate-500">
            Не знаете как? Вижте стъпка по стъпка в{" "}
            <Link href="/kak-da" className="font-medium text-brand-700 hover:underline">
              ръководствата „Как да…“
            </Link>{" "}
            или попитайте в{" "}
            <Link href="/pomoshti" className="font-medium text-brand-700 hover:underline">
              Пенсии и помощи
            </Link>
            .
          </p>
        </section>
      </div>
    </>
  );
}
