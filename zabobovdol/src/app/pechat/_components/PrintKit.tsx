// Общите части на листовете за печат (/pechat, /pechat/sedmitsa,
// /pechat/plakat, /pechat/avtobus): лентата с бутона над листа, заглавието
// на листа с герба, кутията 112, долният блок с QR кода и реда за
// независимостта, и „Още за печат“ под листа.
//
// Листът е A4 (globals.css: @page A4, поле 10 мм) и трябва да излиза на ЕДИН
// лист — проверка с page.pdf() и pdfinfo. На хартия фоновете не се печатат
// (по подразбиране в браузъра), затова кутиите разчитат на рамки.
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Bus,
  CalendarDays,
  Megaphone,
  Phone,
  type LucideIcon,
} from "@/components/icons";
import { PrintButton } from "@/components/PrintButton";
import { formatPhoneBg } from "@/lib/phone";
import { SITE } from "@/lib/site";

/** Изречението за независимостта — на всеки лист, видимо (не дребен шрифт). */
export const INDEPENDENT =
  "Независим граждански проект — не е официален сайт на Община Бобов дол.";

export type SheetPath = "/pechat" | "/pechat/sedmitsa" | "/pechat/plakat" | "/pechat/avtobus";

const SHEETS: { href: SheetPath; title: string; text: string; icon: LucideIcon }[] = [
  {
    href: "/pechat",
    title: "Важни телефони",
    text: "Телефоните в Бобов дол на един лист — за у дома или за възрастен близък.",
    icon: Phone,
  },
  {
    href: "/pechat/sedmitsa",
    title: "Седмицата в Бобов дол",
    text: "Дежурни аптеки, спиране на ток и вода, новини и измами — с едър шрифт, за таблото.",
    icon: CalendarDays,
  },
  {
    href: "/pechat/plakat",
    title: "Плакат с QR код",
    text: "За аптеката, пощата, кметството или спирката.",
    icon: Megaphone,
  },
  {
    href: "/pechat/avtobus",
    title: "Разписание на автобусите",
    text: "Бобов дол ⇄ Дупница — за спирката или у дома.",
    icon: Bus,
  },
];

/** Трохите на листовете: „За печат“ → листът. */
export function sheetCrumbs(current: SheetPath, name: string) {
  const root = { name: "За печат", path: "/pechat" };
  return current === "/pechat" ? [root] : [root, { name, path: current }];
}

type SheetWidth = "max-w-2xl" | "max-w-3xl";

/**
 * Страницата на лист: вляво лентата с бутона и самият лист, вдясно (на lg)
 * „Още за печат“; на по-тесен екран „Още за печат“ е под листа. Листът е
 * подравнен вляво с H1 (не центриран). На хартия излиза само листът.
 */
export function SheetLayout({
  current,
  width = "max-w-2xl",
  note,
  printLabel = "Отпечатайте листа",
  sheetClassName = "",
  children,
}: {
  current: SheetPath;
  width?: SheetWidth;
  /** Бележка вляво от бутона (напр. „Листът е за хартия A4.“). */
  note?: ReactNode;
  printLabel?: string;
  /** Допълнителни класове на самия лист (напр. центриран плакат). */
  sheetClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="container-content grid gap-10 py-8 sm:py-10 lg:grid-cols-[minmax(0,1fr),17rem] print:block print:max-w-none print:p-0">
      <div className="min-w-0">
        <SheetToolbar label={printLabel} width={width}>
          {note}
        </SheetToolbar>
        <Sheet width={width} className={sheetClassName}>
          {children}
        </Sheet>
      </div>
      <MorePrint current={current} />
    </div>
  );
}

/**
 * Лентата точно над листа: бутонът за печат вдясно (и по желание бележка
 * вляво). Ширината е колкото листа (`width`).
 */
function SheetToolbar({
  label,
  width,
  children,
}: {
  label: string;
  width: SheetWidth;
  children?: ReactNode;
}) {
  return (
    <div
      className={`no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${width}`}
    >
      <div className="min-w-0 text-base text-slate-700">{children}</div>
      <div className="shrink-0 [&>button]:w-full sm:[&>button]:w-auto">
        <PrintButton label={label} />
      </div>
    </div>
  );
}

/** Обвивката на листа: бяла „хартия“ на екрана, без рамка и отстъп на хартия. */
function Sheet({
  width,
  className = "",
  children,
}: {
  width: SheetWidth;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article
      className={`print-sheet rounded-2xl border border-slate-300 bg-white p-5 text-slate-900 shadow-sm sm:p-8 print:max-w-none print:rounded-none print:p-0 ${width} ${className}`}
    >
      {children}
    </article>
  );
}

/** Заглавието на листа: гербът + име + подзаглавие. */
export function SheetHead({
  title,
  subtitle,
  size = "md",
}: {
  title: string;
  subtitle?: ReactNode;
  /** lg — „Седмицата“ (едър шрифт за таблото). */
  size?: "md" | "lg";
}) {
  return (
    <header className="flex items-center gap-4 border-b-2 border-slate-300 pb-4 print:pb-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/bobov-dol-grb.png"
        alt="Герб на Бобов дол"
        width={48}
        height={69}
        className={size === "lg" ? "h-16 w-auto shrink-0" : "h-14 w-auto shrink-0"}
      />
      {/* anywhere: домейнът и дългите думи се пренасят на 320px при едър шрифт. */}
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <h2
          className={
            size === "lg"
              ? "font-display text-3xl font-extrabold leading-tight text-slate-900 sm:text-4xl"
              : "font-display text-2xl font-bold leading-tight text-slate-900"
          }
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className={
              size === "lg"
                ? "mt-1 text-xl font-semibold text-slate-700"
                : "mt-1 text-base text-slate-700"
            }
          >
            {subtitle}
          </p>
        )}
      </div>
    </header>
  );
}

/**
 * Кутията „Спешен телефон 112“ (цветова роля „спешно“ — червено). На хартия
 * остава рамката. `compact` — 112 и пояснението на един ред (по-нисък лист).
 */
export function Sheet112({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <div
        className={`callout-danger flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-2 border-crimson-300 py-3 text-center ${className}`}
      >
        <span className="text-base font-semibold text-crimson-700">Спешен телефон</span>
        <span className="font-display text-4xl font-extrabold leading-none text-crimson-700">
          112
        </span>
        <span className="text-base text-slate-800">полиция · спешна помощ · пожарна</span>
      </div>
    );
  }
  return (
    <div className={`callout-danger border-2 border-crimson-300 text-center ${className}`}>
      <p className="text-base font-semibold text-crimson-700">Спешен телефон</p>
      <p className="font-display text-5xl font-extrabold leading-tight text-crimson-700">112</p>
      <p className="text-base text-slate-800">полиция · спешна помощ · пожарна</p>
    </div>
  );
}

/**
 * Долният блок на листа: QR код + „Повече на …“ + обяснение + телефон за
 * поправки + независимостта. На телефон QR кодът е над текста, а домейнът
 * се пренася (иначе излизаше извън листа на 320–390px).
 */
export function SheetFooter({
  qr,
  lead,
  className = "",
  children,
}: {
  qr: ReactNode;
  lead: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <footer
      className={`mt-6 flex flex-col items-start gap-4 border-t-2 border-slate-300 pt-4 sm:flex-row sm:items-center ${className}`}
    >
      <div className="shrink-0">{qr}</div>
      <div className="min-w-0 text-base text-slate-700">
        <p className="font-display text-xl font-bold leading-snug text-slate-900 [overflow-wrap:anywhere]">
          {lead}
        </p>
        {children && <div className="mt-1">{children}</div>}
        {SITE.contact.phone && (
          <p className="mt-1">
            Въпроси и поправки:{" "}
            <strong className="whitespace-nowrap font-bold text-slate-900">
              {formatPhoneBg(SITE.contact.phone)}
            </strong>
          </p>
        )}
        <p className="mt-1 font-semibold text-slate-900">{INDEPENDENT}</p>
      </div>
    </footer>
  );
}

/** QR кодът към сайта (готовата картинка) за долния блок. */
export function SiteQr() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/qr-zabobovdol.png"
      alt={`QR код към ${SITE.domain}`}
      width={96}
      height={96}
      className="h-24 w-24 print:h-20 print:w-20"
    />
  );
}

/** „Още за печат“ — другите листове като карти-връзки. */
function MorePrint({ current }: { current: SheetPath }) {
  const others = SHEETS.filter((s) => s.href !== current);
  return (
    <section aria-labelledby="oshte-za-pechat" className="no-print min-w-0">
      <h2 id="oshte-za-pechat" className="section-title">
        Още за печат
      </h2>
      <ul role="list" className="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
        {others.map((s) => {
          const Icon = s.icon;
          return (
            <li key={s.href}>
              <Link href={s.href} className="card group flex h-full flex-col gap-3">
                <span className="icon-chip-sm">
                  <Icon aria-hidden />
                </span>
                <span className="h-card text-brand-800">{s.title}</span>
                <span className="text-base text-slate-700">{s.text}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
