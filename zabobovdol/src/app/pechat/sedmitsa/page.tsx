import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { SITE } from "@/lib/site";
import { buildMetadata } from "@/lib/seo";
import { formatPhoneBg } from "@/lib/phone";
import { SECTION } from "@/lib/section-names";
import { PageHero } from "@/components/ui";
import { QrCode } from "@/components/QrCode";
import {
  Sheet112,
  SheetFooter,
  SheetHead,
  SheetLayout,
  SHEET_TITLE,
  sheetCrumbs,
} from "../_components/PrintKit";
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
    <>
      <PageHero
        className="no-print"
        eyebrow={SECTION.print}
        title={SHEET_TITLE["/pechat/sedmitsa"]}
        intro="За хората без смартфон. Листът се попълва сам от сайта: дежурни аптеки, спиране на ток и вода, новини, измами и важни телефони — с едър шрифт."
        crumbs={sheetCrumbs("/pechat/sedmitsa")}
      >
        <p className="max-w-3xl text-base text-slate-700">
          Разпечатайте го в понеделник и го закачете на таблото в аптеката, пощата,
          кметството или клуба. Можете да го дадете и на възрастен съсед.
        </p>
      </PageHero>

      {/* Лист за печат (A4, портрет) — едър шрифт */}
      <SheetLayout
        current="/pechat/sedmitsa"
        width="max-w-3xl"
        sheetClassName="text-lg"
        note={
          nothing ? (
            <p className="callout-warning" role="status">
              За тази седмица още няма въведени дежурства, прекъсвания или новини — на
              листа ще има само спешния телефон.
            </p>
          ) : (
            "Листът е за хартия A4."
          )
        }
      >
        <SheetHead
          title="Седмицата в Бобов дол"
          subtitle={fmtWeekRange(start, end)}
          size="lg"
          independent
        />

        <Sheet112 className="mt-5" />

        {dutyDays.length > 0 && (
          <section className="mt-6 break-inside-avoid" aria-labelledby="sedmitsa-apteki">
            <h3 id="sedmitsa-apteki" className="font-display text-2xl font-bold text-slate-900">
              Дежурни аптеки
            </h3>
            {/* На телефон (под sm) редът е стек: денят като подзаглавие, под
                него аптеката и телефонът — трите колони не се събират в листа
                (min-content ≈390px). От sm и на хартия (A4 ≈ 718px) — таблица. */}
            <table className="mt-2 w-full text-left max-sm:block">
              <tbody className="max-sm:block">
                {dutyDays.map((day) =>
                  day.items.map((d, i) => (
                    <tr
                      key={d.id}
                      className="border-b border-slate-200 align-top max-sm:block max-sm:py-2"
                    >
                      {/* Денят се вижда на първия ред от деня; на следващите
                          е само за екранния четец (всеки ред има заглавие). */}
                      <th
                        scope="row"
                        className={
                          i === 0
                            ? "py-2 pr-3 font-semibold text-slate-800 max-sm:block max-sm:p-0"
                            : "py-2 pr-3 max-sm:sr-only"
                        }
                      >
                        {i === 0 ? (
                          fmtDutyDay(day.date)
                        ) : (
                          <span className="sr-only">{fmtDutyDay(day.date)}</span>
                        )}
                      </th>
                      <td className="min-w-0 py-2 pr-3 max-sm:block max-sm:p-0 max-sm:pt-1">
                        <div className="font-bold">{d.pharmacy}</div>
                        {d.address && <div className="text-base text-slate-700">{d.address}</div>}
                        {d.hours && <div className="text-base text-slate-700">{d.hours}</div>}
                        {d.note && <div className="text-base text-slate-700">{d.note}</div>}
                      </td>
                      <td className="whitespace-nowrap py-2 text-right text-xl font-bold tabular-nums max-sm:block max-sm:p-0 max-sm:pt-1 max-sm:text-left">
                        {formatPhoneBg(d.phone)}
                      </td>
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
            <ul role="list" className="mt-2 space-y-3">
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
            className="callout-danger mt-6 break-inside-avoid text-lg"
            aria-labelledby="sedmitsa-izmama"
          >
            <h3 id="sedmitsa-izmama" className="font-display text-2xl font-bold text-crimson-700">
              Внимание — измама
            </h3>
            <p className="mt-1 font-bold text-slate-900">{scam.title}</p>
            {scam.summary && (
              <p className="mt-1 text-slate-800">{shorten(scam.summary, 260)}</p>
            )}
            {scam.source && <p className="mt-1 text-base text-slate-700">Източник: {scam.source}</p>}
          </section>
        )}

        {posts.length > 0 && (
          <section className="mt-6 break-inside-avoid" aria-labelledby="sedmitsa-novini">
            <h3 id="sedmitsa-novini" className="font-display text-2xl font-bold text-slate-900">
              Новини
            </h3>
            <ul role="list" className="mt-2 space-y-3">
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
            <ul role="list" className="mt-2">
              {otherPhones.map((s) => (
                <li
                  key={s.id}
                  className="flex items-baseline justify-between gap-3 border-b border-slate-200 py-2"
                >
                  <span className="min-w-0 font-medium text-slate-800 [overflow-wrap:anywhere]">{s.name}</span>
                  <span className="shrink-0 whitespace-nowrap text-xl font-bold tabular-nums">
                    {formatPhoneBg(s.phone)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="callout-note mt-6 font-semibold text-slate-900">
          Истинският ни адрес: <span className="[overflow-wrap:anywhere]">{SITE.domain}</span>{" "}
          — никога не искаме пари, ЕГН, ПИН или кодове от SMS. При съмнение затворете и
          звъннете на близък или на 112.
        </p>

        <SheetFooter
          qr={
            <QrCode
              value={`${SITE.url}/?s=print`}
              label="QR код към сайта „За Бобов дол“"
              size={96}
              className="h-24 w-24"
            />
          }
          lead={<>Повече на {SITE.domain}</>}
          independent={false}
        >
          Листът е генериран на {fmtGenerated(now)} от данните в сайта „За Бобов дол“.
          Нещата се променят — при съмнение проверете по телефона.
        </SheetFooter>
      </SheetLayout>
    </>
  );
}
