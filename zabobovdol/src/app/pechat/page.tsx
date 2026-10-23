import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SITE } from "@/lib/site";
import { buildMetadata } from "@/lib/seo";
import { PrintButton } from "@/components/PrintButton";

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

// Другите листове за печат — за хората без смартфон и за таблата в града.
const MORE_PRINT = [
  {
    href: "/pechat/sedmitsa",
    title: "Седмицата в Бобов дол",
    text: "Дежурни аптеки, спиране на ток и вода, новини и измами — едър шрифт, за таблото.",
  },
  {
    href: "/pechat/plakat",
    title: "Плакат с QR код",
    text: "За аптеката, пощата, кметството или спирката.",
  },
  {
    href: "/pechat/avtobus",
    title: "Разписание на автобусите",
    text: "За спирката или у дома.",
  },
];

export default async function PrintPage() {
  const services = await prisma.service.findMany({
    where: { published: true, phone: { not: "" } },
    orderBy: [{ isEmergency: "desc" }, { category: "asc" }, { order: "asc" }],
    take: 30,
  });

  return (
    <div className="container-content py-8">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Важни телефони за печат
          </h1>
          <p className="text-slate-600">
            Принтирайте този лист и го закачете на видно място у дома или го
            подарете на възрастен близък.
          </p>
        </div>
        <PrintButton />
      </div>

      <nav aria-label="Още листове за печат" className="no-print mb-6">
        <h2 className="text-lg font-semibold text-slate-800">Още за печат</h2>
        <ul className="mt-2 grid gap-3 sm:grid-cols-3">
          {MORE_PRINT.map((m) => (
            <li key={m.href}>
              <Link
                href={m.href}
                className="card block h-full"
              >
                <span className="block font-semibold text-brand-700">{m.title}</span>
                <span className="mt-1 block text-slate-600">{m.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Лист за печат (A4) */}
      <div className="print-sheet mx-auto max-w-2xl rounded-xl border border-slate-300 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 border-b-2 border-slate-200 pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/bobov-dol-grb.png" alt="Герб на Бобов дол" width={40} height={58} className="h-14 w-auto" />
          <div>
            <div className="font-display text-2xl font-bold text-slate-900">
              Важни телефони — Бобов дол
            </div>
            <div className="text-sm text-slate-600">{SITE.domain}</div>
          </div>
        </div>

        <div className="mt-5 rounded-lg bg-red-50 p-3 text-center">
          <div className="text-sm font-medium text-red-800">Спешен телефон</div>
          <div className="font-display text-4xl font-extrabold text-red-700">112</div>
          <div className="text-xs text-red-700">полиция · спешна помощ · пожарна</div>
        </div>

        <table className="mt-5 w-full text-left text-sm">
          <tbody>
            {services
              .filter((s) => s.phone !== "112")
              .map((s) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-medium text-slate-800">{s.name}</td>
                  <td className="py-2 text-right font-bold text-slate-900">{s.phone}</td>
                </tr>
              ))}
          </tbody>
        </table>

        <div className="mt-5 rounded-lg border border-slate-200 p-3 text-sm">
          <div className="font-semibold text-slate-800">При изгубена банкова карта (денонощно):</div>
          <div className="mt-1 text-slate-700">Банка ДСК: <strong>0700 10 375</strong> · Пощенска банка: <strong>0700 18 555</strong></div>
        </div>

        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Пазете се от измами!</strong> Банка и полиция НИКОГА не искат
          ПИН, кодове или да дадете пари на „куриер“. При съмнение — затворете и
          звъннете на близък или на 112.
        </div>

        <div className="mt-6 flex items-center gap-4 border-t-2 border-slate-200 pt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/qr-zabobovdol.png" alt="QR код към сайта" width={90} height={90} className="h-24 w-24" />
          <div className="text-sm text-slate-700">
            <div className="font-display text-lg font-bold text-slate-900">
              Сканирайте за повече
            </div>
            Услуги, обяви, събития и обяснения „Как да…“ на{" "}
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
