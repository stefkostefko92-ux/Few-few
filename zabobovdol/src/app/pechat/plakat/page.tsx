import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { buildMetadata } from "@/lib/seo";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Плакат за разпечатване — За Бобов дол",
  description:
    "Готов за печат плакат (A4) с QR код към сайта „За Бобов дол“. Разпечатайте и закачете в аптеката, кметството, на спирката или в магазина, за да го видят повече хора.",
  path: "/pechat/plakat",
});

export default function PosterPage() {
  return (
    <div className="container-content py-8">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Плакат за разпечатване
          </h1>
          <p className="max-w-xl text-slate-600">
            Разпечатайте този плакат (A4) и го закачете на видно място — в
            аптеката, кметството, на автобусната спирка, в магазина или в
            читалището. Така и хората, които още не познават сайта, ще го открият.
          </p>
        </div>
        <PrintButton label="Принтирай плаката" />
      </div>

      {/* Лист за печат (A4, портрет) */}
      <div className="print-sheet mx-auto flex max-w-2xl flex-col items-center rounded-2xl border border-slate-300 bg-white p-10 text-center shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/bobov-dol-grb.png"
          alt="Герб на Бобов дол"
          width={120}
          height={173}
          className="h-32 w-auto"
        />

        <h2 className="mt-5 font-display text-5xl font-extrabold tracking-tight text-brand-800">
          За Бобов дол
        </h2>
        <p className="mt-2 text-xl font-semibold text-slate-700">
          Всичко за града — на едно място
        </p>

        <p className="mt-5 max-w-md text-lg text-slate-700">
          Важни телефони, аптека, пенсии и помощи, обяви, събития, транспорт и
          обяснения „как да…“ стъпка по стъпка — лесно и разбираемо, за всички
          възрасти.
        </p>

        {/* Голям QR код */}
        <div className="mt-7 rounded-2xl border-2 border-slate-200 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/qr-zabobovdol.png"
            alt="QR код към сайта"
            width={220}
            height={220}
            className="h-56 w-56"
          />
        </div>
        <p className="mt-3 text-lg font-semibold text-slate-800">
          Сканирайте с телефона
        </p>
        <p className="mt-1 font-display text-2xl font-extrabold text-brand-700">
          {SITE.domain}
        </p>

        {/* Най-важните телефони */}
        <div className="mt-7 grid w-full max-w-md grid-cols-1 gap-3 text-left">
          <div className="rounded-xl bg-red-50 p-4 text-center">
            <div className="text-sm font-medium text-red-800">Спешен телефон</div>
            <div className="font-display text-4xl font-extrabold text-red-700">112</div>
            <div className="text-xs text-red-700">полиция · спешна помощ · пожарна</div>
          </div>
          {SITE.contact.phone && (
            <div className="rounded-xl border border-slate-200 p-3 text-center text-slate-700">
              За въпроси и предложения:{" "}
              <strong className="text-slate-900">{SITE.contact.phone}</strong>
            </div>
          )}
        </div>

        <p className="mt-6 text-xs text-slate-400">
          Независим граждански проект в полза на жителите на {SITE.geo.city}.
        </p>
      </div>
    </div>
  );
}
