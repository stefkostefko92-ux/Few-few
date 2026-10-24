import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SITE } from "@/lib/site";
import { buildMetadata } from "@/lib/seo";
import { PrintButton } from "@/components/PrintButton";
import { QrCode } from "@/components/QrCode";
import {
  capFirst,
  fmtDate,
  fmtDutyDay,
  fmtGenerated,
  fmtWeekRange,
  fmtWhen,
  groupByDay,
  outageWhere,
  shorten,
  weekWindow,
} from "./week";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...buildMetadata({
    title: "Седмицата в Бобов дол — лист за печат",
    description:
      "Готов за печат лист A4 с едър шрифт: дежурните аптеки за следващите 7 дни, обявените спирания на ток и вода, последните новини, предупреждение за измама и важните телефони в Бобов дол.",
    path: "/pechat/sedmitsa",
  }),
  keywords: [
    "седмицата в Бобов дол",
    "дежурна аптека Бобов дол",
    "спиране на ток Бобов дол",
    "важни телефони Бобов дол",
    "лист за печат",
    "Carbon Stealth",
  ],
};

const UTILITY: Record<string, string> = { ELECTRICITY: "Ток", WATER: "Вода" };

// Всяка заявка е отделно защитена: ако една част липсва, листът пак излиза
// с останалите (празна част просто не се показва).
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export default async function WeekSheetPage() {
  const now = new Date();
  const { start, end } = weekWindow(now);

  const [duty, outages, posts, scam, phones] = await Promise.all([
    safe(
      prisma.dutyRoster.findMany({
        where: { published: true, date: { gte: start, lt: end } },
        orderBy: [{ date: "asc" }, { pharmacy: "asc" }],
        take: 21,
      }),
      [],
    ),
    // Обявените (планови) спирания за седмицата — виж outageWhere (стенно време).
    safe(
      prisma.outage.findMany({
        where: outageWhere(now, start, end),
        orderBy: [{ startAt: "asc" }],
        take: 6,
      }),
      [],
    ),
    safe(
      prisma.post.findMany({
        where: { published: true },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: 3,
        select: { id: true, title: true, excerpt: true, source: true, publishedAt: true, createdAt: true },
      }),
      [],
    ),
    safe(
      prisma.scamAlert.findFirst({
        where: { published: true },
        orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
        select: { title: true, summary: true, source: true },
      }),
      null,
    ),
    safe(
      prisma.service.findMany({
        where: { published: true, isEmergency: true, phone: { not: "" } },
        orderBy: [{ order: "asc" }, { name: "asc" }],
        take: 12,
        select: { id: true, name: true, phone: true },
      }),
      [],
    ),
  ]);

  const dutyDays = groupByDay(duty);
  const otherPhones = phones.filter((s) => s.phone.trim() !== "112");
  const nothing =
    dutyDays.length === 0 && outages.length === 0 && posts.length === 0 && !scam && otherPhones.length === 0;

  return (
    <div className="container-content py-8">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Седмицата в Бобов дол — лист за печат
          </h1>
          <p className="mt-1 text-lg text-slate-700">
            За хората без смартфон. Листът се попълва сам от сайта: дежурни аптеки,
            спиране на ток и вода, новини, измами и важни телефони — с едър шрифт.
          </p>
          <p className="mt-2 text-slate-600">
            Разпечатайте го в понеделник и го закачете на таблото в аптеката, пощата,
            кметството или клуба. Можете да го дадете и на възрастен съсед.
          </p>
          {nothing && (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-900" role="status">
              За тази седмица още няма въведени дежурства, прекъсвания или новини — на листа
              ще има само спешния телефон.
            </p>
          )}
        </div>
        <PrintButton label="Печат" />
      </div>

      {/* Лист за печат (A4, портрет) — едър шрифт */}
      <article className="print-sheet mx-auto max-w-3xl rounded-xl border border-slate-300 bg-white p-8 text-lg text-slate-900 shadow-sm">
        <header className="flex items-center gap-4 border-b-2 border-slate-200 pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/bobov-dol-grb.png"
            alt="Герб на Бобов дол"
            width={48}
            height={69}
            className="h-16 w-auto"
          />
          <div>
            <h2 className="font-display text-4xl font-extrabold leading-tight text-slate-900">
              Седмицата в Бобов дол
            </h2>
            <p className="text-xl font-semibold text-slate-700">{fmtWeekRange(start, end)}</p>
          </div>
        </header>

        <div className="mt-5 rounded-lg bg-red-50 p-3 text-center">
          <div className="text-base font-medium text-red-800">Спешен телефон</div>
          <div className="font-display text-5xl font-extrabold text-red-700">112</div>
          <div className="text-base text-red-700">полиция · спешна помощ · пожарна</div>
        </div>

        {dutyDays.length > 0 && (
          <section className="mt-6 break-inside-avoid" aria-labelledby="sedmitsa-apteki">
            <h3 id="sedmitsa-apteki" className="font-display text-2xl font-bold text-slate-900">
              Дежурни аптеки
            </h3>
            <table className="mt-2 w-full text-left">
              <tbody>
                {dutyDays.map((day) =>
                  day.items.map((d, i) => (
                    <tr key={d.id} className="border-b border-slate-200 align-top">
                      <th scope="row" className="py-2 pr-3 font-semibold text-slate-800">
                        {i === 0 ? fmtDutyDay(day.date) : ""}
                      </th>
                      <td className="py-2 pr-3">
                        <div className="font-bold">{d.pharmacy}</div>
                        {d.address && <div className="text-base text-slate-700">{d.address}</div>}
                        {d.hours && <div className="text-base text-slate-700">{d.hours}</div>}
                        {d.note && <div className="text-base text-slate-700">{d.note}</div>}
                      </td>
                      <td className="whitespace-nowrap py-2 text-right text-xl font-bold">{d.phone}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
            <p className="mt-1 text-base text-slate-700">
              При съмнение звъннете на аптеката, преди да тръгнете.
            </p>
          </section>
        )}

        {outages.length > 0 && (
          <section className="mt-6 break-inside-avoid" aria-labelledby="sedmitsa-spirane">
            <h3 id="sedmitsa-spirane" className="font-display text-2xl font-bold text-slate-900">
              Спиране на ток и вода
            </h3>
            <ul className="mt-2 space-y-3">
              {outages.map((o) => (
                <li key={o.id} className="border-b border-slate-200 pb-2">
                  <div className="font-bold">
                    {UTILITY[o.utility] ?? "Ток"}
                    {o.startAt && <> · {capFirst(fmtWhen(o.startAt))}</>}
                    {o.endAt && <> – {fmtWhen(o.endAt)}</>}
                  </div>
                  {o.area && <div>{shorten(o.area, 220)}</div>}
                  {o.source && <div className="text-base text-slate-700">Източник: {o.source}</div>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {scam && (
          <section
            className="mt-6 break-inside-avoid rounded-lg bg-amber-50 p-4 text-amber-900"
            aria-labelledby="sedmitsa-izmama"
          >
            <h3 id="sedmitsa-izmama" className="font-display text-2xl font-bold">
              Внимание — измама
            </h3>
            <p className="mt-1 font-bold">{scam.title}</p>
            {scam.summary && <p className="mt-1">{shorten(scam.summary, 260)}</p>}
            {scam.source && <p className="mt-1 text-base">Източник: {scam.source}</p>}
          </section>
        )}

        {posts.length > 0 && (
          <section className="mt-6 break-inside-avoid" aria-labelledby="sedmitsa-novini">
            <h3 id="sedmitsa-novini" className="font-display text-2xl font-bold text-slate-900">
              Новини
            </h3>
            <ul className="mt-2 space-y-3">
              {posts.map((p) => (
                <li key={p.id} className="border-b border-slate-200 pb-2">
                  <div className="font-bold">
                    {fmtDate(p.publishedAt ?? p.createdAt)} — {p.title}
                  </div>
                  {p.excerpt && <div>{shorten(p.excerpt, 180)}</div>}
                  {p.source && <div className="text-base text-slate-700">Източник: {p.source}</div>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {otherPhones.length > 0 && (
          <section className="mt-6 break-inside-avoid" aria-labelledby="sedmitsa-telefoni">
            <h3 id="sedmitsa-telefoni" className="font-display text-2xl font-bold text-slate-900">
              Важни телефони
            </h3>
            <table className="mt-2 w-full text-left">
              <tbody>
                {otherPhones.map((s) => (
                  <tr key={s.id} className="border-b border-slate-200">
                    <td className="py-2 pr-3 font-medium text-slate-800">{s.name}</td>
                    <td className="whitespace-nowrap py-2 text-right text-xl font-bold">{s.phone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <p className="mt-6 rounded-lg bg-amber-50 p-3 text-base font-semibold text-amber-900">
          Истинският ни адрес: {SITE.domain} — никога не искаме пари, ЕГН, ПИН или
          кодове от SMS. При съмнение затворете и звъннете на близък или на 112.
        </p>

        <footer className="mt-6 flex items-center gap-4 border-t-2 border-slate-200 pt-4">
          <QrCode
            value={`${SITE.url}/?s=print`}
            label="QR код към сайта „За Бобов дол“"
            size={96}
            className="h-24 w-24 shrink-0"
          />
          <div className="text-base text-slate-700">
            <div className="font-display text-xl font-bold text-slate-900">
              Повече на {SITE.domain}
            </div>
            Листът е генериран на {fmtGenerated(now)} от данните в сайта „За Бобов дол“.
            Нещата се променят — при съмнение проверете по телефона.
            {SITE.contact.phone && (
              <div className="mt-1">
                Въпроси и поправки: <strong>{SITE.contact.phone}</strong>
              </div>
            )}
          </div>
        </footer>
      </article>

      <p className="no-print mx-auto mt-6 max-w-3xl text-slate-600">
        Още за печат: <Link href="/pechat" className="font-semibold text-brand-700 underline">важните телефони</Link>{" "}
        и <Link href="/pechat/plakat" className="font-semibold text-brand-700 underline">плакат с QR код</Link>.
      </p>
    </div>
  );
}
