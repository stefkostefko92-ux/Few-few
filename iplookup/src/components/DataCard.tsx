import type { ReactNode } from "react";

import type { SourceResult } from "@/lib/sources/base";

/**
 * Градивните части на страницата с резултат.
 *
 * Две правила, които не се нарушават:
 *
 * 1. **Цветът никога не носи смисъла сам.** Всеки знак има форма (икона) и
 *    текст. Далтонизмът засяга точно двойката червено–зелено, тоест точно
 *    „опасно“ срещу „наред“.
 * 2. **„Няма данни“ и „източникът падна“ са различни неща** и се изписват
 *    различно. Първото е факт за адреса, второто — за нас.
 */

export function Card({
  title,
  hint,
  children,
  source,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  source?: SourceResult<unknown> | null;
}) {
  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="card-title">{title}</h2>
        {source ? <SourceLine source={source} /> : null}
      </div>
      {hint ? <p className="mb-3 text-sm text-text-muted">{hint}</p> : null}
      {children}
    </section>
  );
}

/** Ред „етикет → стойност“. Техническите стойности са равноширок шрифт. */
export function Field({
  label,
  value,
  mono = true,
  note,
}: {
  label: string;
  value?: ReactNode;
  mono?: boolean;
  note?: string;
}) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="border-b border-border py-2 last:border-0 sm:grid sm:grid-cols-[13rem_1fr] sm:gap-4">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className={mono ? "value-mono text-sm" : "text-sm text-text"}>
        {value}
        {note ? <span className="mt-1 block font-sans text-xs text-text-faint">{note}</span> : null}
      </dd>
    </div>
  );
}

export function Fields({ children }: { children: ReactNode }) {
  return <dl>{children}</dl>;
}

export type BadgeTone = "ok" | "warn" | "danger" | "info" | "neutral";

const TONE: Record<BadgeTone, { className: string; icon: string; label: string }> = {
  // `label` е за екранния четец: иконата е декоративна, значението идва от думи.
  ok: { className: "border-ok text-ok", icon: "✔", label: "Наред:" },
  warn: { className: "border-warn text-warn", icon: "▲", label: "Внимание:" },
  danger: { className: "border-danger text-danger", icon: "✖", label: "Опасност:" },
  info: { className: "border-info text-info", icon: "ℹ", label: "Информация:" },
  neutral: { className: "border-border-strong text-text-muted", icon: "•", label: "" },
};

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  const style = TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium ${style.className}`}
    >
      <span aria-hidden="true">{style.icon}</span>
      {style.label ? <span className="sr-only">{style.label}</span> : null}
      <span>{children}</span>
    </span>
  );
}

/** Ред с произхода на данните: кой източник, колко време, какво стана. */
export function SourceLine({ source }: { source: SourceResult<unknown> }) {
  const label =
    source.status === "ok" ? `${source.ms} ms` : source.status === "empty" ? "няма данни" : "недостъпен";
  return (
    <p className="text-xs text-text-faint">
      <a href={source.sourceUrl} className="underline underline-offset-2" rel="noreferrer">
        {source.source}
      </a>{" "}
      · {label}
    </p>
  );
}

/**
 * Обяснение защо карта е празна. Разликата между двете състояния е съществена:
 * „регистърът няма такъв запис“ е информация за адреса, „не успяхме да питаме“
 * е информация за нас — и не бива да се чете като първото.
 */
export function EmptyNote({ source }: { source: SourceResult<unknown> }) {
  if (source.status === "ok") return null;
  const fallback =
    source.status === "empty"
      ? "За този адрес няма запис в източника."
      : "Източникът не отговори — данните по-долу може да са непълни.";
  return (
    <p className={`text-sm ${source.status === "error" ? "text-warn" : "text-text-muted"}`}>
      {source.message ?? fallback}
    </p>
  );
}
