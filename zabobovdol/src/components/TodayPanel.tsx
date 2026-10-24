// Панел „Днес в Бобов дол“ — най-важното за деня на едно място, високо на
// началната страница. Сървърен компонент без собствени заявки: данните идват
// от началната (кешираните функции от @/lib/cache), логиката „днес/утре по
// София“ е в @/lib/today.
//
// Правило: празно поле не се показва (никакви празни рамки), а където нямаме
// проверени данни — само връзка към раздела, без измислени стойности.

import Link from "next/link";
import type { ReactNode } from "react";
import { Bus, CalendarDays, Cross, Newspaper, Zap, type LucideIcon } from "@/components/icons";
import { TelLink } from "@/components/TelLink";
import { outageTitle } from "@/lib/ingest-outages-rss";
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

const NEWS_DATE = new Intl.DateTimeFormat("bg-BG", {
  timeZone: "Europe/Sofia",
  day: "numeric",
  month: "long",
  year: "numeric",
});

// text-green-700 има тъмен вариант (светлозелен) и иконата избледнява върху
// светлата значка; green-800 остава тъмен и в двата режима.
const DUTY_CHIP = "bg-green-100 text-green-800";
const LINK = "font-semibold text-slate-900 underline-offset-4 hover:underline";
const MORE = "inline-flex min-h-[44px] items-center text-base font-semibold text-brand-700 underline underline-offset-4";

function Row({
  icon: Icon,
  chip,
  label,
  children,
}: {
  icon: LucideIcon;
  chip: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className={"mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg " + chip}>
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        {children}
      </div>
    </li>
  );
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
  /** По избор — до заглавието (напр. времето); изчезва сам, ако е празен. */
  aside?: ReactNode;
}) {
  const w = sofiaWallWindow(now);
  const shownOutages = outages.slice(0, MAX_OUTAGES);
  const moreOutages = outages.length - shownOutages.length;
  const hasCalendar = calendar.feasts.length > 0 || calendar.names.length > 0;

  return (
    <section
      aria-labelledby="dnes-title"
      className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="dnes-title" className="section-title">
            Днес в Бобов дол
          </h2>
          <p className="mt-3 text-lg text-slate-700">
            Днес е <strong className="text-slate-900">{calendar.dateText}</strong>
          </p>
        </div>
        {aside}
      </div>

      <ul className="mt-3 divide-y divide-slate-200">
        {hasCalendar && (
          <Row icon={CalendarDays} chip="bg-purple-100 text-purple-700" label="Имен ден и празник">
            <Link href="/imen-den" className={"inline-flex min-h-[44px] flex-col justify-center " + LINK}>
              {calendar.feasts.length > 0 && (
                <span className="block text-crimson-700">{calendar.feasts.join(" · ")}</span>
              )}
              {calendar.names.length > 0 && (
                <span className="block">Имен ден: {calendar.names.join(", ")}</span>
              )}
            </Link>
          </Row>
        )}

        {duty.length > 0 ? (
          <Row icon={Cross} chip={DUTY_CHIP} label="Дежурна аптека днес">
            <ul className="space-y-2">
              {duty.map((d) => (
                <li key={d.id}>
                  <Link href="/dezhurna-apteka" className={"inline-flex min-h-[44px] items-center text-lg " + LINK}>
                    {d.pharmacy}
                  </Link>
                  {(d.address || d.hours) && (
                    <p className="text-base text-slate-700">
                      {[d.address, d.hours].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {d.phone && (
                    <TelLink
                      phone={d.phone}
                      className="a11y-btn mt-1 inline-flex items-center rounded-lg px-1 text-base font-semibold text-brand-700 underline underline-offset-4"
                      aria-label={`Обадете се на ${d.pharmacy}: ${d.phone}`}
                    >
                      {d.phone}
                    </TelLink>
                  )}
                </li>
              ))}
            </ul>
          </Row>
        ) : (
          <Row icon={Cross} chip={DUTY_CHIP} label="Аптеки">
            <Link href="/dezhurna-apteka" className={MORE}>
              Дежурна аптека →
            </Link>
          </Row>
        )}

        {shownOutages.length > 0 && (
          <Row icon={Zap} chip="bg-amber-100 text-amber-700" label="Спиране на ток и вода — днес и утре">
            <ul className="space-y-1">
              {shownOutages.map((o) => {
                const hours = outageHours(o, w);
                return (
                  <li key={o.id}>
                    <Link
                      href={`/prekysvaniya#${o.slug}`}
                      className={"inline-flex min-h-[44px] flex-col justify-center " + LINK}
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
            {moreOutages > 0 && (
              <Link href="/prekysvaniya" className={MORE}>
                Още {moreOutages} →
              </Link>
            )}
          </Row>
        )}

        {buses.length > 0 ? (
          <Row icon={Bus} chip="bg-sky-100 text-sky-700" label="Следващ автобус днес">
            <ul>
              {buses.map((b) => (
                <li key={b.title} className="text-lg text-slate-900">
                  {b.title}: <strong>{b.time}</strong>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-sm text-slate-600">
              Разписанието може да се променя — при съмнение проверете на спирката.
            </p>
            <Link href="/transport" className={MORE}>
              Цялото разписание →
            </Link>
          </Row>
        ) : (
          <Row icon={Bus} chip="bg-sky-100 text-sky-700" label="Пътуване">
            <Link href="/transport" className={MORE}>
              Транспорт →
            </Link>
          </Row>
        )}

        {news && (
          <Row
            icon={Newspaper}
            chip="bg-blue-100 text-blue-700"
            label={`Последна новина · ${NEWS_DATE.format(news.date)}`}
          >
            <Link href={`/novini/${news.slug}`} className={"inline-flex min-h-[44px] items-center " + LINK}>
              {news.title}
            </Link>
          </Row>
        )}
      </ul>
    </section>
  );
}
