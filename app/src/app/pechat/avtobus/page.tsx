import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { buildMetadata } from "@/lib/seo";
import { BUS } from "@/lib/bus-schedule";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Автобусно разписание Дупница ⇄ Бобов дол за печат",
  description:
    "Разписанието на автобуса Дупница – Бобов дол (превозвач Даци-Р), готово за печат и закачане на видно място. С едър шрифт и QR код към сайта.",
  path: "/pechat/avtobus",
});

export default function BusPrintPage() {
  return (
    <div className="container-content py-8">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Автобусно разписание за печат
          </h1>
          <p className="text-slate-600">
            Принтирайте този лист и го закачете на видно място у дома или го
            подарете на възрастен близък.
          </p>
        </div>
        <PrintButton />
      </div>

      {/* Лист за печат (A4) */}
      <div className="print-sheet mx-auto max-w-3xl rounded-xl border border-slate-300 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 border-b-2 border-slate-200 pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/dupnitsa-grb.png"
            alt="Герб на Дупница"
            width={40}
            height={58}
            className="h-14 w-auto"
          />
          <div>
            <div className="font-display text-2xl font-bold text-slate-900">
              Автобус Дупница ⇄ Бобов дол
            </div>
            <div className="text-sm text-slate-500">
              Превозвач: {BUS.carrier} · {SITE.domain}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {BUS.directions.map((d) => (
            <div key={d.title}>
              <h2 className="font-display text-xl font-bold text-slate-900">
                {d.title}
              </h2>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {d.times.map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-slate-300 px-1.5 py-1.5 text-center text-lg font-bold text-slate-900"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <ul className="mt-3 space-y-1 text-sm text-slate-700">
                {d.notes.map((n, i) => (
                  <li key={i}>• {n}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Разписанието може да се променя. При съмнение проверете на спирката
          или с превозвача.
        </div>

        <div className="mt-6 flex items-center gap-4 border-t-2 border-slate-200 pt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/qr-zadupnitsa.png"
            alt="QR код към сайта"
            width={90}
            height={90}
            className="h-24 w-24"
          />
          <div className="text-sm text-slate-700">
            <div className="font-display text-lg font-bold text-slate-900">
              Сканирайте за повече
            </div>
            Телефони, услуги и обяснения „Как да…“ на{" "}
            <strong>{SITE.domain}</strong>
            {SITE.contact.phone && (
              <div className="mt-1">
                Контакт: <strong>{SITE.contact.phone}</strong>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
