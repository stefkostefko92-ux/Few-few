// Общите градивни елементи на публичните страници. Стилът е в globals.css
// (@layer components: .panel, .card, .callout-*, .chip, .icon-chip, .link…);
// тук е само структурата. Всичко работи в тъмен режим и висок контраст,
// защото стъпва на пренасочените класове.
import Link from "next/link";
import { isValidElement, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Inbox,
  Info,
  ShieldAlert,
  type LucideIcon,
} from "@/components/icons";
import { JsonLd } from "@/components/JsonLd";
import { HelpfulWidget } from "@/components/HelpfulWidget";
import { PrintButton } from "@/components/PrintButton";
import { ShareButton } from "@/components/ShareButton";
import { breadcrumbLd } from "@/lib/seo";
import { formatDate, isoDate, type DateInput } from "@/lib/format-date";

export type Crumb = { name: string; path: string };

/* ───────────────────────── Заглавна лента ───────────────────────── */

/**
 * Заглавната лента на вътрешна страница: трохи → eyebrow → H1 със златна
 * черта → увод → мета ред (PageMeta) → допълнително съдържание (children).
 * `breadcrumbJsonLd={false}` — когато страницата сама слага BreadcrumbList
 * в своя JsonLd (иначе излиза два пъти).
 */
export function PageHero({
  title,
  intro,
  crumbs,
  eyebrow,
  meta,
  breadcrumbJsonLd = true,
  className = "",
  children,
}: {
  title: string;
  intro?: ReactNode;
  crumbs?: Crumb[];
  eyebrow?: string;
  /** Ред под увода — напр. <PageMeta reviewed={…} sources={…} />. */
  meta?: ReactNode;
  /** false → без BreadcrumbList JSON-LD (страницата го слага сама). */
  breadcrumbJsonLd?: boolean;
  className?: string;
  /** Допълнително под увода (бутони, чипове). */
  children?: ReactNode;
}) {
  const all = crumbs && crumbs.length > 0 ? [{ name: "Начало", path: "/" }, ...crumbs] : null;
  return (
    <div
      className={`page-hero relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-brand-50 via-white to-white print:border-0 print:bg-none ${className}`}
    >
      <div className="container-content relative py-7 sm:py-11 print:py-2">
        {/* Гербът като дискретен воден знак — в мрежата (до десния ръб на
            съдържанието), само на широк екран; никога върху текста. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/bobov-dol-grb-mark.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute right-4 top-1/2 hidden h-40 max-h-[85%] w-auto -translate-y-1/2 select-none opacity-[0.06] lg:right-8 lg:block print:hidden"
          width={140}
          height={200}
        />
        <div className="relative">
          {all && <Breadcrumbs crumbs={all} />}
          {all && breadcrumbJsonLd && <JsonLd data={breadcrumbLd(all)} />}
          {eyebrow && <p className={`eyebrow ${all ? "mt-3" : ""}`}>{eyebrow}</p>}
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {title}
          </h1>
          <div aria-hidden className="rule-gold mt-3" />
          {intro && (
            <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-600">{intro}</p>
          )}
          {meta && <div className="mt-3 max-w-3xl">{meta}</div>}
          {children && <div className="mt-5">{children}</div>}
        </div>
      </div>
    </div>
  );
}

/**
 * Трохи. На телефон — само „‹ родител“ (една едра връзка назад); от sm —
 * целият път с разделител ›, текущата страница с aria-current. Не се печатат.
 */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length === 0) return null;
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
  return (
    <nav
      aria-label="Навигация по трохи"
      className="text-base text-slate-600 sm:text-sm print:hidden"
    >
      {parent && (
        <Link
          href={parent.path}
          className="-ml-1 inline-flex min-h-tap items-center gap-1 rounded-lg px-1 font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-brand-700 hover:decoration-brand-700 sm:hidden"
        >
          <ChevronDown className="h-5 w-5 shrink-0 rotate-90" aria-hidden />
          {parent.name}
        </Link>
      )}
      <ol className="hidden flex-wrap items-center gap-x-1 gap-y-0.5 sm:flex">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${i}-${c.path}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && (
                <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-slate-400" aria-hidden />
              )}
              {last ? (
                <span aria-current="page" className="text-slate-700">
                  {c.name}
                </span>
              ) : (
                <Link
                  href={c.path}
                  className="inline-flex min-h-8 items-center underline decoration-slate-300 underline-offset-4 hover:text-brand-700 hover:decoration-brand-700"
                >
                  {c.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * „Проверено на 24 октомври 2026 г. · Източници: НОИ, АСП“. Без `reviewed`
 * показва „Последна редакция: …“ от `updated`. Датата е РЕАЛНА (от базата или
 * константа до текста) — същата като dateModified в JSON-LD.
 */
export function PageMeta({
  reviewed,
  updated,
  sources,
  className = "",
}: {
  reviewed?: DateInput | null;
  updated?: DateInput | null;
  sources?: string | readonly string[];
  className?: string;
}) {
  const parts: ReactNode[] = [];
  const when = reviewed ?? updated ?? null;
  const text = when != null ? formatDate(when) : "";
  if (when != null && text) {
    parts.push(
      <span key="d">
        {reviewed != null ? "Проверено на " : "Последна редакция: "}
        <time dateTime={isoDate(when)}>{text}</time>
      </span>,
    );
  }
  const src = typeof sources === "string" ? sources : sources?.join(", ");
  if (src) parts.push(<span key="s">Източници: {src}</span>);
  if (parts.length === 0) return null;
  // Точката-разделител е залепена (U+00A0) за предходния текст — при
  // пренасяне остава в края на реда, а не в началото на следващия.
  return (
    <p className={`text-meta ${className}`}>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span aria-hidden="true">{" · "}</span>}
          {p}
        </span>
      ))}
    </p>
  );
}

/* ───────────────────────── Секции ───────────────────────── */

/**
 * Заглавният ред на секция: H2 със златна черта и (по избор) „Вижте всички →“
 * на същата базова линия. За екранен четец връзката казва и коя секция.
 */
export function SectionHeader({
  title,
  href,
  hrefLabel = "Вижте всички",
  id,
  className = "",
}: {
  title: ReactNode;
  href?: string;
  hrefLabel?: string;
  /** id на H2 (за aria-labelledby на секцията). */
  id?: string;
  className?: string;
}) {
  return (
    <div
      className={`mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 ${className}`}
    >
      <h2 id={id} className="section-title">
        {title}
      </h2>
      {href && (
        <Link href={href} className="link-more shrink-0">
          {hrefLabel}
          {typeof title === "string" && <span className="sr-only">: {title}</span>}
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
}

export function Section({
  title,
  href,
  hrefLabel,
  tone = "plain",
  id,
  className = "",
  children,
}: {
  title: string;
  href?: string;
  /** По подразбиране „Вижте всички“. */
  hrefLabel?: string;
  /** „muted“ слага лента с топъл фон през цялата ширина — дава ритъм на дългата
   *  начална страница, за да не е една непрекъсната отсечка. */
  tone?: "plain" | "muted";
  /** Котва на секцията (#id); H2 получава id „{id}-zaglavie“. */
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const headingId = id ? `${id}-zaglavie` : undefined;
  const inner = (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`container-content py-10 ${className}`}
    >
      <SectionHeader title={title} href={href} hrefLabel={hrefLabel} id={headingId} />
      {children}
    </section>
  );

  if (tone === "muted") {
    return <div className="border-y border-slate-200/70 bg-paper-muted">{inner}</div>;
  }
  return inner;
}

/* ───────────────────────── Списъци ───────────────────────── */

export type FilterChip = {
  href: string;
  label: string;
  active?: boolean;
  /** Бройка до етикета („Здраве · 2“). */
  count?: number;
};

/**
 * Чипове за филтриране на списък (категории). Текущият — aria-current="page".
 * tone="neutral" — сив активен чип (траурните страници).
 */
export function FilterChips({
  items,
  label,
  tone = "brand",
  className = "",
}: {
  items: FilterChip[];
  /** Име на навигацията за екранен четец, напр. „Категории услуги“. */
  label: string;
  tone?: "brand" | "neutral";
  className?: string;
}) {
  if (items.length === 0) return null;
  const chip = tone === "neutral" ? "chip chip-neutral" : "chip";
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex flex-wrap gap-2">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} className={chip} aria-current={it.active ? "page" : undefined}>
              {it.label}
              {typeof it.count === "number" && (
                <span className="chip-count">· {it.count}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Лентата над списък: вляво броят („27 услуги“), вдясно главното действие
 * (btn-primary „Подайте обява“). На телефон действието е на цяла ширина.
 */
export function ListToolbar({
  count,
  action,
  children,
  className = "",
}: {
  count?: ReactNode;
  action?: ReactNode;
  /** Допълнително вляво (напр. FilterChips или сортиране). */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      {(count != null || children) && (
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {count != null && <p className="text-base font-medium text-slate-700">{count}</p>}
          {children}
        </div>
      )}
      {action && (
        <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row sm:flex-wrap [&>*]:w-full sm:[&>*]:w-auto">
          {action}
        </div>
      )}
    </div>
  );
}

export type Fact = { label: string; value: ReactNode; icon?: LucideIcon };

/**
 * Фактите в детайл (Адрес, Телефон, Работно време…) като <dl>: етикетът е
 * малък и сив, стойността — основен текст. Празните стойности се пропускат.
 */
export function FactList({ items, className = "" }: { items: Fact[]; className?: string }) {
  const rows = items.filter(
    (f) => f.value !== null && f.value !== undefined && f.value !== "" && f.value !== false,
  );
  if (rows.length === 0) return null;
  return (
    <dl className={`divide-y divide-slate-200 ${className}`}>
      {rows.map((f) => {
        const Icon = f.icon;
        return (
          <div key={f.label} className="py-3 first:pt-0 last:pb-0">
            <dt className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
              {Icon && <Icon className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />}
              {f.label}
            </dt>
            <dd className="mt-0.5 text-base text-slate-900 [overflow-wrap:anywhere]">{f.value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * Празно състояние: спокоен панел с иконно квадратче, заглавие, подсказка и
 * (по избор) действие — напр. <Link className="btn-primary">Подайте обява</Link>.
 */
export function EmptyState({
  title,
  hint,
  action,
  icon: Icon = Inbox,
  className = "",
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={`panel px-6 py-8 text-center sm:py-10 ${className}`}>
      <span className="icon-chip-lg mx-auto mb-4">
        <Icon aria-hidden />
      </span>
      <p className="h-card">{title}</p>
      {hint && <p className="mx-auto mt-2 max-w-md text-base text-slate-600">{hint}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}

/* ───────────────────────── Известия ───────────────────────── */

export type NoticeTone = "info" | "note" | "success" | "warning" | "danger" | "scam";

// Пълни имена на класовете (не `callout-${tone}`) — иначе Tailwind не ги вижда.
const NOTICE: Record<NoticeTone, { box: string; icon: LucideIcon | null; iconCls: string }> = {
  info: { box: "callout-info", icon: Info, iconCls: "text-brand-700" },
  note: { box: "callout-note", icon: null, iconCls: "text-gold-700" },
  success: { box: "callout-success", icon: CheckCircle2, iconCls: "text-green-700" },
  warning: { box: "callout-warning", icon: AlertTriangle, iconCls: "text-amber-700" },
  danger: { box: "callout-danger", icon: AlertTriangle, iconCls: "text-crimson-700" },
  scam: {
    box: "callout-danger border-l-4 border-l-crimson-600",
    icon: ShieldAlert,
    iconCls: "text-crimson-700",
  },
};

/**
 * Известие в кутия по цветова роля. tone="scam" добавя червена черта вляво и
 * връзка към /izmami. `icon={null}` — без икона; `role="alert"` само за
 * грешки, които се появяват след действие.
 */
export function Notice({
  tone = "info",
  title,
  titleAs: Title = "p",
  icon,
  children,
  action,
  role,
  scamLink = true,
  className = "",
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  /** Заглавието като h2/h3, ако е раздел от страницата. */
  titleAs?: "p" | "h2" | "h3";
  icon?: LucideIcon | null;
  children?: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status" | "note";
  /** Само за tone="scam": връзката към /izmami (на самата /izmami — false). */
  scamLink?: boolean;
  className?: string;
}) {
  const t = NOTICE[tone];
  const Icon = icon === null ? null : (icon ?? t.icon);
  return (
    <div role={role} className={`${t.box} flex gap-3 ${className}`}>
      {Icon && <Icon className={`mt-0.5 h-6 w-6 shrink-0 ${t.iconCls}`} aria-hidden />}
      <div className="min-w-0 flex-1">
        {title && (
          <Title className="font-sans text-lg font-semibold leading-snug text-slate-900">
            {title}
          </Title>
        )}
        {children && (
          <div className={`${title ? "mt-1 " : ""}text-base text-slate-800 [&>*+*]:mt-2`}>
            {children}
          </div>
        )}
        {tone === "scam" && scamLink && (
          <p className="mt-2 text-base">
            <Link href="/izmami" className="link">
              Как да разпознаете измама
            </Link>
          </p>
        )}
        {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

/* ───────────────────────── Ръководства ───────────────────────── */

export type StepItem = { title: ReactNode; body?: ReactNode };
export type Step = ReactNode | StepItem;

function isStepItem(s: Step): s is StepItem {
  return (
    typeof s === "object" &&
    s !== null &&
    !isValidElement(s) &&
    !Array.isArray(s) &&
    "title" in s
  );
}

/**
 * Номерирани стъпки: плътен кръг с номера и текст text-lg. tone="danger" —
 * само за „Ако вече ви измамиха“. Стъпката е ReactNode или {title, body}.
 */
export function StepList({
  steps,
  tone = "brand",
  start = 1,
  className = "",
}: {
  steps: Step[];
  tone?: "brand" | "danger";
  start?: number;
  className?: string;
}) {
  const num = tone === "danger" ? "step-num step-num-danger" : "step-num";
  return (
    <ol role="list" start={start} className={`space-y-5 ${className}`}>
      {steps.map((s, i) => (
        <li key={i} className="flex gap-4">
          <span className={num}>
            <span className="sr-only">Стъпка </span>
            {start + i}
          </span>
          <div className="min-w-0 flex-1 pt-1 text-lg text-slate-800">
            {isStepItem(s) ? (
              <>
                <p className="font-semibold text-slate-900">{s.title}</p>
                {s.body && <div className="mt-1 text-slate-700 [&>*+*]:mt-2">{s.body}</div>}
              </>
            ) : (
              s
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Краят на статия/ръководство в ЕДИН панел: вляво „Помогна ли ви? Да/Не“,
 * вдясно Сподели и Отпечатайте (+ допълнителни действия от children, първи).
 * На телефон бутоните са един под друг на цяла ширина. Не се печата.
 */
export function ArticleActions({
  helpful = true,
  shareTitle,
  shareText,
  sharePath,
  printLabel = "Отпечатайте",
  children,
  className = "",
}: {
  helpful?: boolean;
  /** Без него бутонът „Сподели“ не се показва. */
  shareTitle?: string;
  shareText?: string;
  sharePath?: string;
  /** false → без бутон за печат. */
  printLabel?: string | false;
  children?: ReactNode;
  className?: string;
}) {
  const hasButtons = Boolean(children || shareTitle || printLabel);
  return (
    <div
      className={`no-print panel mt-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between ${className}`}
    >
      {helpful && <HelpfulWidget bare />}
      {hasButtons && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start [&>*]:w-full sm:[&>*]:w-auto [&>div>button]:w-full sm:[&>div>button]:w-auto">
          {children}
          {shareTitle && <ShareButton title={shareTitle} text={shareText} path={sharePath} />}
          {printLabel && <PrintButton variant="secondary" label={printLabel} />}
        </div>
      )}
    </div>
  );
}

export function Prose({ html }: { html: string }) {
  return (
    <div
      className="prose-content text-slate-700"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
