import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { buildMetadata } from "@/lib/seo";
import { TRANSPORT_PROVIDERS, TRANSPORT_NOTE } from "@/lib/bus-schedule";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Транспорт от Дупница — превозвачи и телефони за печат",
  description:
    "Автогара Дупница и превозвачите (Юнион Ивкони, M&M Травел, Даци-Р) — маршрути и телефони за връзка, готови за печат и закачане на видно място. С едър шрифт и QR код.",
  path: "/pechat/avtobus",
});

export default function BusPrintPage() {
  return (
    <div className="container-content py-8">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Транспорт от Дупница — за печат
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
            src="/brand/dupnitsa-grb.svg"
            alt="Герб на Дупница"
            width={40}
            height={58}
            className="h-14 w-auto"
          />
          <div>
            <div className="font-display text-2xl font-bold text-slate-900">
              Транспорт от Дупница
            </div>
            <div className="text-sm text-slate-500">
              Превозвачи и телефони · {SITE.domain}
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {TRANSPORT_PROVIDERS.map((p) => (
            <div
              key={p.name}
              className="rounded-lg border border-slate-300 p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl font-bold text-slate-900">
                  {p.name}
                </h2>
                <span className="text-sm font-medium text-slate-500">
                  {p.kind}
                </span>
              </div>
              <p className="mt-1 text-base text-slate-700">{p.routes}</p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-lg font-bold text-slate-900">
                {p.phones.map((tel) => (
                  <span key={tel}>☎ {tel}</span>
                ))}
              </div>
              {p.address && (
                <div className="mt-1 text-sm text-slate-600">{p.address}</div>
              )}
              {p.website && (
                <div className="mt-1 text-sm text-slate-600">{p.website}</div>
              )}
              {p.note && (
                <div className="mt-1 text-sm text-slate-500">{p.note}</div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {TRANSPORT_NOTE}
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
