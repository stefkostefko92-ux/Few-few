import Link from "next/link";
import type { Metadata } from "next";
import { Factory, Info, Megaphone } from "@/components/icons";
import { PageHero, Prose } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { renderMarkdown } from "@/lib/markdown";
import { getWasteSchedule } from "@/lib/settings";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "График за сметосъбиране в Бобов дол",
  description:
    "Кога се извозва битовият отпадък по квартали и в кои дни — график за сметосъбирането в Бобов дол и съветите за разделно събиране.",
  path: "/grafik-smetosabirane",
});

export default async function WasteSchedulePage() {
  const schedule = await getWasteSchedule();

  return (
    <>
      <PageHero
        eyebrow="Чистота"
        title="График за сметосъбиране"
        intro="Кога се извозва битовият отпадък по квартали и в кои дни да изнасяте кофите."
        crumbs={[{ name: "Сметосъбиране", path: "/grafik-smetosabirane" }]}
      />

      <div className="container-content space-y-8 py-10">
        <section className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-6">
          <div className="flex items-center gap-2">
            <Factory className="h-6 w-6 text-brand-700" aria-hidden />
            <h2 className="text-2xl font-bold text-slate-900">Дни на извозване</h2>
          </div>
          {schedule ? (
            <div className="mt-3 text-lg">
              <Prose html={renderMarkdown(schedule)} />
            </div>
          ) : (
            <p className="mt-3 text-slate-700">
              Графикът все още не е публикуван. Скоро тук ще видите по кои дни се извозва
              отпадъкът във вашия квартал. За въпроси се обърнете към общината.
            </p>
          )}
          <p className="mt-4 flex items-start gap-2 text-sm text-slate-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" aria-hidden />
            <span>Изнасяйте кофите вечерта преди деня на извозване или рано сутринта.</span>
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Megaphone className="h-5 w-5 text-brand-700" aria-hidden />
            Видяхте нерегламентирано сметище?
          </h2>
          <p className="mt-2 text-slate-700">
            Подайте сигнал със снимка и местоположение — общината ще го разчисти.
          </p>
          <Link href="/smetishta" className="btn-primary mt-3 inline-flex">
            Подай сигнал за сметище →
          </Link>
        </section>

        <div className="no-print">
          <PrintButton variant="secondary" label="Принтирай графика" />
        </div>
      </div>
    </>
  );
}
