// Шаблонът на четирите правни документа (Общи условия, Поверителност,
// Бисквитки, Достъпност): мета ред с датата и печат, връзки между
// документите, съдържание с котви (на lg — лепкава колона вдясно, на
// телефон — сгънато над текста) и заглавен ред на таблиците.
// Стилът е от globals.css (.panel, .chip, .label-caps, .table-stack…).
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { ChevronDown } from "@/components/icons";
import { PrintButton } from "@/components/PrintButton";
import { PrintSourceLine } from "@/components/PrintSourceLine";
import { formatDate } from "@/lib/format-date";

export const LEGAL_DOCS = [
  { href: "/pravila", label: "Общи условия" },
  { href: "/poveritelnost", label: "Поверителност" },
  { href: "/biskvitki", label: "Бисквитки" },
  { href: "/dostapnost", label: "Достъпност" },
] as const;

export type LegalPath = (typeof LEGAL_DOCS)[number]["href"];

/** Съдържание на документа: id на заглавието → текст (в реда на документа). */
export type Toc = Readonly<Record<string, string>>;

/**
 * Връзките към четирите документа (текущият — запълнен, с aria-current).
 * Не се печатат.
 */
function LegalDocsNav({ current, className = "" }: { current: LegalPath; className?: string }) {
  return (
    <nav aria-label="Правни документи" className={`no-print ${className}`}>
      <ul role="list" className="flex flex-wrap gap-2">
        {LEGAL_DOCS.map((d) => (
          <li key={d.href}>
            <Link
              href={d.href}
              className="chip"
              aria-current={d.href === current ? "page" : undefined}
            >
              {d.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Редът под увода в PageHero: „Последна актуализация: 24 октомври 2026 г.“,
 * бутон за печат и (от sm) връзките към четирите документа. На телефон
 * връзките са в края на документа (LegalLayout), за да е героят нисък.
 * `updated` е датата като „2026-10-24“ — същата като в JSON-LD.
 */
export function LegalMeta({ updated, current }: { updated: string; current: LegalPath }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <p className="text-base text-slate-700">
          Последна актуализация:{" "}
          <time dateTime={updated} className="font-semibold text-slate-900">
            {formatDate(updated, { wall: true })}
          </time>
        </p>
        <PrintButton variant="secondary" label="Отпечатайте" />
      </div>
      <LegalDocsNav current={current} className="hidden sm:block" />
    </div>
  );
}

/**
 * Точките на съдържанието. Еднакъв отстъп над и под текста (py-2.5, текстът
 * отгоре, не центриран): между едноредова и двуредова точка разстоянието е
 * едно и също, а целта пак е ≥44px.
 */
function TocLinks({ items }: { items: [string, string][] }) {
  return (
    <ul role="list" className="mt-1">
      {items.map(([id, label]) => (
        <li key={id}>
          <a
            href={`#${id}`}
            className="link-quiet flex min-h-tap items-start py-2.5 text-base leading-snug text-brand-700"
          >
            {label}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * Тялото на правния документ: колона за четене (подравнена с H1, не
 * центрирана) + съдържание. На lg съдържанието е лепкаво вдясно; на телефон
 * е сгънато над текста. На хартия съдържанието не излиза, а най-долу има
 * ред „отпечатано на …“ с адреса на страницата — затова страниците на
 * документите са `force-dynamic` (иначе датата е денят на билда).
 */
export function LegalLayout({
  toc,
  path,
  children,
}: {
  toc: Toc;
  path: LegalPath;
  children: ReactNode;
}) {
  const items = Object.entries(toc);
  return (
    <div className="container-content grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr),17rem] print:block print:py-4">
      {/* break-word: дълъг имейл или адрес се пренася само ако не се събира
          (на 320px и при едър шрифт), без да троши обикновените думи. */}
      <article className="min-w-0 max-w-3xl [overflow-wrap:break-word]">
        {items.length > 0 && (
          <details className="group panel no-print mb-8 lg:hidden">
            <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between gap-3 font-sans text-lg font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
              Съдържание
              <ChevronDown
                className="h-6 w-6 shrink-0 text-brand-700 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <nav aria-label="Съдържание на документа" className="mt-2">
              <TocLinks items={items} />
            </nav>
          </details>
        )}
        {children}
        <div className="no-print mt-10 border-t border-slate-200 pt-6 sm:hidden">
          <p className="label-caps">Правна информация</p>
          <LegalDocsNav current={path} className="mt-3" />
        </div>
        <PrintSourceLine path={path} />
      </article>
      {items.length > 0 && (
        <aside className="no-print hidden lg:block">
          <nav
            aria-label="Съдържание на документа"
            className="panel sticky top-[calc(var(--header-offset)+1rem)] max-h-[calc(100vh-var(--header-offset)-2rem)] overflow-y-auto"
          >
            <p className="label-caps">Съдържание</p>
            <TocLinks items={items} />
          </nav>
        </aside>
      )}
    </div>
  );
}

/**
 * Заглавният ред на таблица в правен текст (стилът — от .prose-content в
 * globals.css: text-base, заглавията на сив фон). На телефон таблицата е
 * .table-stack: всеки ред става блок, а името на колоната идва от
 * data-label на клетката.
 */
export function LegalTableHead({ cols }: { cols: readonly string[] }) {
  return (
    <thead>
      <tr>
        {cols.map((c) => (
          <th key={c} scope="col">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/**
 * Класът на таблица в правен текст (виж LegalTableHead). <code> в таблицата
 * НЕ се къса където и да е (в .prose-content е `overflow-wrap: anywhere`):
 * авто-ширината на колоните иначе троши имената по средата
 * („zbd_splash_see/n“). Дългите имена се пренасят след „_“ — виж CodeName.
 */
export const LEGAL_TABLE = "table-stack [&_code]:[overflow-wrap:normal]";

/**
 * Таблица с 4 колони и <code> (бисквитките): стек като .table-stack, но под xl
 * (1280px), не само под 640px. Най-тясната ѝ ширина е ~566px при шрифт 125% —
 * на 640–767px и на 1024–1279px (до колоната е съдържанието) не се събира и
 * имената се трошат по средата („zbd_sessi/on“) или излиза от колоната.
 */
export const LEGAL_TABLE_WIDE =
  "table-stack [&_code]:[overflow-wrap:normal] max-xl:block [&_thead]:max-xl:sr-only [&_tbody]:max-xl:block [&_tr]:max-xl:block [&_tr]:max-xl:border-b [&_tr]:max-xl:border-slate-200 [&_tr]:max-xl:py-3 [&_td]:max-xl:block [&_td]:max-xl:w-full [&_td]:max-xl:border-0 [&_td]:max-xl:px-0 [&_td]:max-xl:py-1 [&_td]:max-xl:text-left [&_td]:max-xl:before:block [&_td]:max-xl:before:text-sm [&_td]:max-xl:before:font-semibold [&_td]:max-xl:before:text-slate-600 [&_td]:max-xl:before:content-[attr(data-label)]";

/**
 * Техническо име (бисквитка, запис в браузъра) като <code>. Дългото (над 16
 * знака) може да се пренесе само след „_“: „zbd_install_banner_/hidden_until“,
 * не по средата на дума; краткото („zbd_session“) остава цяло.
 */
export function CodeName({ children }: { children: string }) {
  if (children.length <= 16) return <code>{children}</code>;
  const parts = children.split("_");
  return (
    <code>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p}
          {i < parts.length - 1 && (
            <>
              _<wbr />
            </>
          )}
        </Fragment>
      ))}
    </code>
  );
}

/**
 * „т. 3“ като връзка към раздела (в същия документ или в друг). В
 * .prose-content стилът идва от prose; извън него — className="link".
 */
export function SecRef({
  n,
  doc,
  className,
}: {
  n: number;
  doc?: LegalPath;
  className?: string;
}) {
  // Неразделим интервал: „т.“ и номерът не се разделят на два реда.
  const text = `т. ${n}`;
  if (doc) {
    return (
      <Link href={`${doc}#t${n}`} className={className}>
        {text}
      </Link>
    );
  }
  return (
    <a href={`#t${n}`} className={className}>
      {text}
    </a>
  );
}
