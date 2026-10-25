import Link from "next/link";
import type { Metadata } from "next";
import { Info, Megaphone, Trash2 } from "@/components/icons";
import { PageHero, Prose } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { renderMarkdown } from "@/lib/markdown";
import { getWasteSchedule } from "@/lib/settings";
import { PrintButton } from "@/components/PrintButton";
import { SECTION } from "@/lib/section-names";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "График за сметосъбиране в Бобов дол",
  description:
    "Кога се извозва битовият отпадък по квартали и в кои дни — график за сметосъбирането в Бобов дол и съветите за разделно събиране.",
  path: "/grafik-smetosabirane",
  keywords: [
    "график сметосъбиране Бобов дол",
    "извозване на боклука Бобов дол",
    "кога минава боклукчийската кола",
    "битови отпадъци Бобов дол",
    "разделно събиране Бобов дол",
    "Carbon Stealth",
  ],
});

export default async function WasteSchedulePage() {
  const schedule = await getWasteSchedule();

  return (
    <>
      <PageHero
        eyebrow={SECTION.daily}
        title="График за сметосъбиране"
        intro="Кога се извозва битовият отпадък по квартали и в кои дни да изнасяте кофите."
        crumbs={[{ name: "Сметосъбиране", path: "/grafik-smetosabirane" }]}
      />

      <div className="container-content space-y-8 py-10">
        <section
          aria-labelledby="dni-zaglavie"
          className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-5 sm:p-6"
        >
          <div className="flex items-center gap-3">
            <span className="icon-chip bg-white">
              <Trash2 aria-hidden />
            </span>
            <h2 id="dni-zaglavie" className="text-2xl font-bold text-slate-900">
              Дни на извозване
            </h2>
          </div>
          {schedule ? (
            <div className="mt-4 text-lg">
              <Prose html={renderMarkdown(schedule)} />
            </div>
          ) : (
            <div className="mt-4 space-y-3 text-base text-slate-700">
              <p className="text-lg font-semibold text-slate-900">
                Графикът все още не е публикуван.
              </p>
              <p>
                Скоро тук ще видите по кои дни се извозва отпадъкът във вашия квартал. Дотогава
                питайте общината.
              </p>
              <Link href="/uslugi?cat=ADMIN" className="link-more">
                Телефони на общината <span aria-hidden="true">→</span>
              </Link>
            </div>
          )}
          <p className="mt-4 flex items-start gap-2 border-t border-brand-200 pt-4 text-base text-slate-700">
            <Info className="mt-1 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
            <span>Изнасяйте кофите вечерта преди деня на извозване или рано сутринта.</span>
          </p>
        </section>

        <section aria-labelledby="smetishte-zaglavie" className="panel">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-4">
              <span className="icon-chip">
                <Megaphone aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 id="smetishte-zaglavie" className="h-card">
                  Видяхте нерегла&shy;ментирано сметище?
                </h2>
                <p className="mt-1 text-base text-slate-700">
                  Подайте сигнал с място и описание — ще го препратим към общината.
                </p>
              </div>
            </div>
            <Link href="/smetishta" className="btn-primary shrink-0">
              Подайте сигнал за сметище
            </Link>
          </div>
        </section>

        {/* Печат — само когато има какво да се отпечата. */}
        {schedule && (
          <div className="no-print">
            <PrintButton variant="secondary" label="Отпечатайте графика" />
          </div>
        )}
      </div>
    </>
  );
}
