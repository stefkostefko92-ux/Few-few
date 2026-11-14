import { SITE } from "@/lib/site";
import { formatDate, isoDate } from "@/lib/format-date";

/**
 * Ред, който излиза САМО на хартия, в края на отпечатана страница:
 * „Независим граждански проект — не е официален сайт на Община Бобов дол.“ и
 * „За Бобов дол · zabobovdol.carbonstealth.eu/kak-da/… · отпечатано на …“.
 * Листът обикаля из къщата и между съседите — да се знае откъде е и колко е
 * пресен. Датата е денят на зареждане (страниците са force-dynamic).
 */
export function PrintSourceLine({ path, className = "" }: { path?: string; className?: string }) {
  const now = new Date();
  return (
    <p className={`print-only mt-6 border-t border-slate-300 pt-2 text-sm text-slate-700 [overflow-wrap:anywhere] ${className}`}>
      {/* Хедърът, футърът и помощната лента не се печатат — без този ред лист
          „Данъци и срокове“ с дата лесно минава за общински. */}
      <span className="block font-semibold text-slate-900">{SITE.independence}</span>
      {SITE.name} · {SITE.domain}
      {path && path !== "/" ? path : ""} · отпечатано на{" "}
      <time dateTime={isoDate(now)}>{formatDate(now)}</time>
    </p>
  );
}
