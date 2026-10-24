import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { SITE } from "@/lib/site";
import { buildMetadata } from "@/lib/seo";
import { formatPhoneBg } from "@/lib/phone";
import { SECTION } from "@/lib/section-names";
import { PageHero } from "@/components/ui";
import {
  Sheet112,
  SheetFooter,
  SheetHead,
  SheetLayout,
  SiteQr,
  SHEET_TITLE,
  sheetCrumbs,
} from "./_components/PrintKit";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...buildMetadata({
    title: "Важни телефони за печат — Бобов дол",
    description:
      "Списък с важни телефони за Бобов дол, готов за печат и закачане у дома. С QR код към сайта за повече информация.",
    path: "/pechat",
  }),
  keywords: [
    "важни телефони Бобов дол",
    "телефони за печат",
    "седмицата в Бобов дол",
    "плакат Бобов дол",
    "За Бобов дол",
    "Carbon Stealth",
  ],
};

// Групите на листа — по категорията на услугата. Редът на групите и на
// категориите в тях е редът на листа (спешните най-горе).
const GROUPS: { title: string; cats: string[] }[] = [
  { title: "Спешни и здраве", cats: ["EMERGENCY", "HEALTH"] },
  { title: "Община и институции", cats: ["ADMIN", "SOCIAL"] },
  { title: "Ток и вода", cats: ["UTILITY"] },
  { title: "Транспорт и такси", cats: ["TRANSPORT"] },
  { title: "Училища и читалища", cats: ["EDUCATION"] },
  { title: "Други", cats: ["OTHER"] },
];

type Row = { id: string; name: string; phone: string; category: string };

function groupRows(rows: Row[]) {
  return GROUPS.map((g) => ({
    title: g.title,
    // В групата — по реда на категориите, а вътре по реда от базата.
    items: g.cats.flatMap((c) => rows.filter((r) => r.category === c)),
  })).filter((g) => g.items.length > 0);
}

export default async function PrintPage() {
  const services = await prisma.service.findMany({
    where: { published: true, phone: { not: "" } },
    orderBy: [{ isEmergency: "desc" }, { category: "asc" }, { order: "asc" }],
    take: 30,
    select: { id: true, name: true, phone: true, category: true },
  });
  const groups = groupRows(services.filter((s) => s.phone.trim() !== "112"));

  return (
    <>
      <PageHero
        className="no-print"
        eyebrow={SECTION.print}
        title={SHEET_TITLE["/pechat"]}
        intro="Отпечатайте този лист и го закачете на видно място у дома или го подарете на възрастен близък."
        crumbs={sheetCrumbs("/pechat")}
      />

      {/* Лист за печат (A4) */}
      <SheetLayout current="/pechat" note="Листът е за хартия A4.">
        <SheetHead title="Важни телефони — Бобов дол" subtitle={SITE.domain} />

        <Sheet112 compact className="mt-5 print:mt-3 print:py-2" />

        {/* На хартия — две колони (групите, двете кутии и долният блок в един
            поток), за да се събере на един лист. */}
        <div className="mt-5 space-y-5 print:mt-3 print:columns-2 print:gap-6 print:space-y-0">
          {groups.map((g) => (
            <section key={g.title}>
              <h3 className="break-after-avoid border-b-2 border-slate-300 pb-1 font-display text-lg font-bold text-slate-900 print:pb-0">
                {g.title}
              </h3>
              <ul role="list">
                {g.items.map((s) => (
                  <li
                    key={s.id}
                    className="flex break-inside-avoid items-baseline justify-between gap-3 print:gap-2 border-b border-slate-200 py-1.5 text-base leading-snug print:py-0.5 print:leading-tight"
                  >
                    <span className="min-w-0 text-slate-800 [overflow-wrap:anywhere]">{s.name}</span>
                    <span className="shrink-0 whitespace-nowrap text-lg font-bold tabular-nums text-slate-900 print:text-base">
                      {formatPhoneBg(s.phone)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <div className="break-inside-avoid rounded-xl border border-slate-300 p-3 text-base leading-snug print:!mb-2">
            <p className="font-semibold text-slate-900">
              При изгубена банкова карта (денонощно):
            </p>
            <p className="mt-1 text-slate-800">
              Банка ДСК: <strong className="whitespace-nowrap">0700 10 375</strong>
              <br />
              Пощенска банка: <strong className="whitespace-nowrap">0700 18 555</strong>
            </p>
          </div>
          <div className="callout-danger break-inside-avoid p-3 leading-snug sm:p-3 print:!mb-2">
            <p className="font-semibold text-crimson-700">Пазете се от измами!</p>
            <p className="mt-1 text-slate-800">
              Банка и полиция НИКОГА не искат ПИН, кодове или да дадете пари на
              „куриер“. При съмнение — затворете и звъннете на близък или на 112.
            </p>
          </div>

          <SheetFooter
            qr={<SiteQr />}
            lead="Сканирайте за повече"
            className="break-inside-avoid print:mt-4"
          >
            Услуги, обяви, събития и обяснения „Как да…“ на{" "}
            <strong className="text-slate-900 [overflow-wrap:anywhere]">{SITE.domain}</strong>
          </SheetFooter>
        </div>
      </SheetLayout>
    </>
  );
}
