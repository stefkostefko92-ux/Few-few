import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { buildMetadata } from "@/lib/seo";
import { BUS } from "@/lib/bus-schedule";
import { SECTION } from "@/lib/section-names";
import { PageHero } from "@/components/ui";
import {
  SheetFooter,
  SheetHead,
  SheetLayout,
  SiteQr,
  sheetCrumbs,
} from "../_components/PrintKit";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Автобусно разписание Бобов дол ⇄ Дупница за печат",
  description:
    "Разписанието на автобуса Бобов дол – Дупница (превозвач Даци-Р), готово за печат и закачане на видно място. С едър шрифт и QR код към сайта.",
  path: "/pechat/avtobus",
  keywords: [
    "автобус Бобов дол Дупница",
    "разписание автобус Бобов дол",
    "Даци-Р разписание",
    "разписание за печат",
    "За Бобов дол",
    "Carbon Stealth",
  ],
});

export default function BusPrintPage() {
  return (
    <>
      <PageHero
        className="no-print"
        eyebrow={SECTION.print}
        title="Автобусно разписание за печат"
        intro="Отпечатайте този лист и го закачете на видно място у дома или го подарете на възрастен близък."
        crumbs={sheetCrumbs("/pechat/avtobus", "Разписание на автобусите")}
      />

      {/* Лист за печат (A4) */}
      <SheetLayout current="/pechat/avtobus" width="max-w-3xl" note="Листът е за хартия A4.">
        <SheetHead
          title="Автобус Бобов дол ⇄ Дупница"
          subtitle={<>Превозвач: {BUS.carrier}</>}
        />

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {BUS.directions.map((d) => (
            <section key={d.title} aria-label={d.title}>
              <h3 className="font-display text-xl font-bold text-slate-900">{d.title}</h3>
              <ul role="list" className="mt-3 grid grid-cols-4 gap-2">
                {d.times.map((t) => (
                  <li
                    key={t}
                    className="rounded-lg border border-slate-300 px-1 py-1.5 text-center text-lg font-bold tabular-nums text-slate-900"
                  >
                    {t}
                  </li>
                ))}
              </ul>
              <ul role="list" className="mt-3 list-disc space-y-1 pl-5 text-base text-slate-800">
                {d.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="callout-note mt-6 text-slate-900">
          Разписанието може да се променя. При съмнение проверете на спирката или с
          превозвача.
        </p>

        <SheetFooter qr={<SiteQr />} lead="Сканирайте за повече">
          Телефони, услуги и обяснения „Как да…“ на{" "}
          <strong className="text-slate-900 [overflow-wrap:anywhere]">{SITE.domain}</strong>
        </SheetFooter>
      </SheetLayout>
    </>
  );
}
