// Компактна карта с днешния имен ден/празник за началната страница.
// Сървърен компонент — изчислява „днес" в зоната на София.
import Link from "next/link";
import { CalendarDays } from "@/components/icons";
import { sofiaToday, dayInfo, formatDateBg } from "@/lib/calendar";

export function TodayCalendar() {
  const today = sofiaToday();
  const info = dayInfo(today.year, today.month, today.day);

  return (
    <Link
      href="/imen-den"
      className="card flex items-start gap-3 hover:border-brand-300"
      aria-label="Календар: именни дни и празници"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
        <CalendarDays className="h-6 w-6" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-slate-600">
          Днес е {formatDateBg(today.month, today.day, today.weekday)}
        </span>
        {info.feasts.length > 0 && (
          <span className="block font-semibold text-crimson-700">{info.feasts.join(" · ")}</span>
        )}
        {info.names.length > 0 ? (
          <span className="block truncate font-semibold text-slate-900">
            Имен ден: {info.names.join(", ")}
          </span>
        ) : (
          <span className="block font-semibold text-slate-900">Именни дни и църковен календар →</span>
        )}
      </span>
    </Link>
  );
}
