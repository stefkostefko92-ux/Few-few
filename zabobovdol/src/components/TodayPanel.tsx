// Панел „Днес в Бобов дол“ — най-важното за деня на едно място, високо на
// началната страница. Сървърен компонент без собствени заявки: данните идват
// от началната (кешираните функции от @/lib/cache), логиката „днес/утре по
// София“ е в @/lib/today.
//
// Правило: празно поле не се показва (никакви празни рамки), а където нямаме
// проверени данни — само връзка към раздела, без измислени стойности.
//
// Вид: статичен .panel; всички иконни квадратчета в един тон (.icon-chip-sm);
// на компютър редовете са в две вестникарски колони (CSS columns, не grid):
// всяка колона се пълни отгоре надолу и браузърът сам ги изравнява — без
// празен блок под по-късия ред (при grid редовете са еднакво високи).
// „Последна новина“ е на цялата ширина отдолу, вместо да виси сама в едната
// колона. Редът на телефон остава същият.

import Link from "next/link";
import type { ReactNode } from "react";
import { Bus, CalendarDays, Cross, Newspaper, Zap, type LucideIcon } from "@/components/icons";
import { PhoneButton } from "@/components/PhoneButton";
import { formatPhoneBg } from "@/lib/phone";
import { outageTitle } from "@/lib/ingest-outages-rss";
import { formatDate, formatDateLong, isoDate } from "@/lib/format-date";
import {
  outageDayLabel,
  outageHours,
  sofiaWallWindow,
  type OutageDay,
  type TodayCalendarInfo,
} from "@/lib/today";

export type TodayDuty = {
  id: string;
  pharmacy: string;
  address: string;
  phone: string;
  hours: string;
};

export type TodayOutage = {
  id: string;
  slug: string;
  utility: string;
  area: string;
  planned: boolean;
  startAt: Date | null;
  endAt: Date | null;
  day: OutageDay;
};

export type TodayNews = { slug: string; title: string; date: Date };

const MAX_OUTAGES = 3;

// Връзка-съдържание (име на аптека, новина, имен ден): винаги подчертана —
// възрастният човек иначе не разбира, че удебеленият текст се натиска.
const LINK = "link-quiet font-semibold text-slate-900";

function More({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="link-more">
      {children}
      <span aria-hidden="true">→</span>
    </Link>
  );
}

function Row({
  icon: Icon,
  label,
  children,
  className = "",
}: {
  icon: LucideIcon;
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <li className={"flex break-inside-avoid items-start gap-3 border-t border-slate-200 py-3 " + className}>
      <span className="icon-chip-sm mt-0.5">
        <Icon aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base text-slate-600">{label}</p>
        {children}
      </div>
    </li>
  );
}

/** „събота, 24 октомври 2026 г.“ → „Събота, 24 октомври 2026 г.“ */
function capitalize(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase("bg-BG") + s.slice(1) : s;
}

export function TodayPanel({
  now,
  calendar,
  duty,
  outages,
  buses,
  news,
  aside,
}: {
  now: Date;
  calendar: TodayCalendarInfo;
  duty: TodayDuty[];
  outages: TodayOutage[];
  buses: { title: string; time: string }[];
  news: TodayNews | null;
  /** По избор — до заглавието (напр. времето). */
  aside?: ReactNode;
}) {
  const w = sofiaWallWindow(now);
  const shownOutages = outages.slice(0, MAX_OUTAGES);
  const moreOutages = outages.length - shownOutages.length;
  const hasCalendar = calendar.feasts.length > 0 || calendar.names.length > 0;

  return (
    <section aria-labelledby="dnes-title" className="panel sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h2 id="dnes-title" className="section-title">
            Днес в Бобов&nbsp;дол
          </h2>
          {/* Датата е подзаглавие — без второ „Днес“. */}
          <p className="mt-3 text-lg font-semibold text-slate-800">
            <time dateTime={isoDate(now)}>{capitalize(formatDateLong(now))}</time>
          </p>
        </div>
        {aside}
      </div>

      <ul className="mt-4 lg:columns-2 lg:gap-x-10">
        {hasCalendar && (
          <Row icon={CalendarDays} label="Имен ден и празник">
            <Link href="/imen-den" className={"inline-flex min-h-tap flex-col justify-center " + LINK}>
              {calendar.feasts.length > 0 && (
                <span className="block text-brand-800">{calendar.feasts.join(" · ")}</span>
              )}
              {calendar.names.length > 0 && (
                <span className="block">Имен ден: {calendar.names.join(", ")}</span>
              )}
            </Link>
          </Row>
        )}

        {duty.length > 0 ? (
          <Row icon={Cross} label="Дежурна аптека днес">
            <ul className="space-y-3">
              {duty.map((d) => (
                <li key={d.id}>
                  <Link href="/dezhurna-apteka" className={"inline-flex min-h-tap items-center text-lg " + LINK}>
                    {d.pharmacy}
                  </Link>
                  {(d.address || d.hours) && (
                    <p className="text-base text-slate-700">
                      {[d.address, d.hours].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {d.phone && (
                    <PhoneButton
                      phone={d.phone}
                      label="Обадете се:"
                      // Видимият текст е в началото (WCAG 2.5.3), аптеката
                      // след него — при няколко дежурни бутоните се различават.
                      aria-label={`Обадете се: ${formatPhoneBg(d.phone)} — ${d.pharmacy}`}
                      className="mt-2"
                    />
                  )}
                </li>
              ))}
            </ul>
          </Row>
        ) : (
          <Row icon={Cross} label="Дежурна аптека днес">
            <p className="text-lg text-slate-900">Графикът за днес още не е въведен.</p>
            <More href="/dezhurna-apteka">Телефоните на аптеките</More>
          </Row>
        )}

        {shownOutages.length > 0 && (
          <Row icon={Zap} label="Спиране на ток и вода — днес и утре">
            <ul className="space-y-1">
              {shownOutages.map((o) => {
                const hours = outageHours(o, w);
                return (
                  <li key={o.id}>
                    <Link
                      href={`/prekysvaniya#${o.slug}`}
                      className={"inline-flex min-h-tap flex-col justify-center " + LINK}
                    >
                      <span className="line-clamp-3 break-words">
                        <span className="text-amber-900">{outageDayLabel(o.day)}:</span> {outageTitle(o)}
                      </span>
                      {hours && <span className="block text-base font-normal text-slate-700">{hours}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {moreOutages > 0 && <More href="/prekysvaniya">Още {moreOutages}</More>}
          </Row>
        )}

        {buses.length > 0 ? (
          <Row icon={Bus} label="Следващ автобус днес">
            <ul>
              {buses.map((b) => (
                <li key={b.title} className="text-lg text-slate-900">
                  {b.title}: <strong className="tabular-nums">{b.time}</strong>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-base text-slate-600">
              Разписанието може да се променя — при съмнение проверете на спирката.
            </p>
            <More href="/transport">Цялото разписание</More>
          </Row>
        ) : (
          <Row icon={Bus} label="Пътуване">
            <More href="/transport">Транспорт</More>
          </Row>
        )}

        {news && (
          <Row
            icon={Newspaper}
            className="lg:[column-span:all]"
            label={
              <>
                Последна новина ·{" "}
                <time dateTime={isoDate(news.date)} className="whitespace-nowrap">
                  {formatDate(news.date)}
                </time>
              </>
            }
          >
            <Link href={`/novini/${news.slug}`} className={"inline-flex min-h-tap items-center " + LINK}>
              {news.title}
            </Link>
          </Row>
        )}
      </ul>
    </section>
  );
}
