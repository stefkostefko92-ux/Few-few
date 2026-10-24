"use client";

// Една система за публичните форми (образец: BusinessForm). Всички форми
// изглеждат и се държат еднакво:
//  • контейнер .form-panel, групи .fieldset + .legend, полета .input;
//  • най-горе „Всички полета са задължителни, освен отбелязаните с „по избор““
//    — звездички няма, отбелязва се само „(по избор)“;
//  • подсказката е под полето (не в placeholder, който изчезва при писане);
//  • при грешка: обобщение най-горе (role=alert, фокусира се) с връзки към
//    полетата + грешка под всяко поле с aria-invalid и червена рамка;
//  • въведеното се пази (стойностите идват обратно от сървъра — виж
//    lib/form-state.ts), след успех фокусът отива на заглавието „Благодарим“.

import { useEffect, useRef, type MouseEvent, type ReactNode, type RefObject } from "react";
import { AlertTriangle, CheckCircle2 } from "@/components/icons";
import type { FormState } from "@/lib/form-state";

/**
 * Класът на полето. Червената рамка при aria-invalid е тук (с тъмен вариант),
 * защото общото `.input` още няма такова състояние — виж заявката в
 * design/requests-lane2.md (тогава остава само "input").
 */
export const INPUT =
  "input aria-[invalid=true]:border-crimson-600 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-crimson-600 dark:aria-[invalid=true]:border-crimson-300 dark:aria-[invalid=true]:ring-crimson-300";

/**
 * Контейнерът на формата. React слага скрити полета ($ACTION_…) в началото на
 * <form> със server action — без нулирането първият видим ред получаваше
 * отстъпа на space-y-5 и над него зееше празно място.
 */
export const FORM = "form-panel [&>input[type=hidden]+*]:!mt-0";

/** Отметка (съгласие) — едро квадратче и цел ≥44px. */
export const CHECK_ROW = "flex min-h-tap cursor-pointer items-start gap-3 text-base text-slate-800";
export const CHECKBOX = "mt-0.5 h-6 w-6 shrink-0 accent-brand-700";

/** Фокус след изпращане: грешката (обобщението) или заглавието при успех. */
export function useFormFocus(state: FormState) {
  const errorRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (state.ok) doneRef.current?.focus();
    else if (state.error || state.fieldErrors) errorRef.current?.focus();
  }, [state]);
  return { errorRef, doneRef };
}

/**
 * Свойствата на полетата от състоянието: стойност след неуспешен опит,
 * aria-invalid и aria-describedby (подсказка + грешка).
 *   const f = fields(state);
 *   <input {...f.props("title", { hint: true })} className={INPUT} />
 */
export function fields(state: FormState, defaults: Record<string, string> = {}) {
  const v = { ...defaults, ...(state.values ?? {}) };
  const fe = state.fieldErrors ?? {};
  const describedBy = (name: string, hint?: boolean) =>
    [hint ? `${name}-hint` : null, fe[name] ? `${name}-error` : null].filter(Boolean).join(" ") ||
    undefined;
  return {
    value: (name: string) => v[name] ?? "",
    error: (name: string): string | undefined => fe[name],
    props: (name: string, opts: { hint?: boolean } = {}) => ({
      id: name,
      name,
      defaultValue: v[name] ?? "",
      "aria-invalid": fe[name] ? (true as const) : undefined,
      "aria-describedby": describedBy(name, opts.hint),
    }),
    checkbox: (name: string, opts: { hint?: boolean } = {}) => ({
      id: name,
      name,
      defaultChecked: v[name] === "on",
      "aria-invalid": fe[name] ? (true as const) : undefined,
      "aria-describedby": describedBy(name, opts.hint),
    }),
  };
}

/** „Всички полета са задължителни, освен…“ — първият ред на всяка форма. */
export function RequiredNote({ children }: { children?: ReactNode }) {
  return (
    <p className="text-base text-slate-600">
      {children ?? <>Всички полета са задължителни, освен отбелязаните с „по избор“.</>}
    </p>
  );
}

/** Грешката под полето (червен текст с икона). */
export function FieldError({ name, error }: { name: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={`${name}-error`} className="mt-1.5 flex items-start gap-1.5 text-base font-medium text-crimson-700">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <span>{error}</span>
    </p>
  );
}

/** Подсказката под полето (свързана чрез aria-describedby="{name}-hint"). */
export function FieldHint({ name, children }: { name: string; children: ReactNode }) {
  return (
    <p id={`${name}-hint`} className="mt-1.5 text-base text-slate-600">
      {children}
    </p>
  );
}

/**
 * Поле: етикет (+ „(по избор)“) → самото поле (children) → грешка → подсказка.
 * Свойствата на полето идват от `fields(state).props(name, { hint })`.
 */
export function Field({
  name,
  label,
  optional = false,
  hint,
  error,
  className = "",
  children,
}: {
  name: string;
  label: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="label" htmlFor={name}>
        {label}
        {optional && <span className="font-normal text-slate-600"> (по избор)</span>}
      </label>
      {children}
      <FieldError name={name} error={error} />
      {hint && <FieldHint name={name}>{hint}</FieldHint>}
    </div>
  );
}

/**
 * Обобщение на грешките най-горе във формата: role=alert, фокусира се след
 * изпращане; всяка грешка по поле е връзка, която премества фокуса в полето.
 */
export function FormError({
  state,
  innerRef,
}: {
  state: FormState;
  innerRef: RefObject<HTMLDivElement | null>;
}) {
  const fe = state.fieldErrors ?? {};
  const keys = Object.keys(fe);
  if (!state.error && keys.length === 0) return null;
  const toField = (name: string) => (e: MouseEvent) => {
    const el = document.getElementById(name);
    if (!el) return;
    e.preventDefault();
    el.focus();
  };
  return (
    <div
      ref={innerRef}
      tabIndex={-1}
      role="alert"
      className="callout-danger flex gap-3 rounded-xl outline-none"
    >
      <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-crimson-700" aria-hidden />
      <div className="min-w-0 flex-1 text-base text-slate-800">
        {keys.length > 0 ? (
          <>
            <p className="font-semibold text-slate-900">Моля, поправете:</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              {keys.map((k) => (
                <li key={k}>
                  {k === "_" ? (
                    fe[k]
                  ) : (
                    <a href={`#${k}`} onClick={toField(k)} className="link">
                      {fe[k]}
                    </a>
                  )}
                </li>
              ))}
            </ul>
            {state.error && <p className="mt-2">{state.error}</p>}
          </>
        ) : (
          <p className="font-semibold text-slate-900">{state.error}</p>
        )}
      </div>
    </div>
  );
}

/** Успех: зелена кутия, заглавието получава фокуса (екранният четец го чете). */
export function FormSuccess({
  title,
  headingRef,
  children,
  action,
  className = "",
}: {
  title: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role="status" className={`callout-success flex gap-3 ${className}`}>
      <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-green-700" aria-hidden />
      <div className="min-w-0 flex-1">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-sans text-xl font-bold text-slate-900 outline-none"
        >
          {title}
        </h2>
        {children && <div className="mt-2 space-y-2 text-lg text-slate-800">{children}</div>}
        {action && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap [&>*]:w-full sm:[&>*]:w-auto">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}

/** Бутонът за изпращане — на телефон на цялата ширина. */
export function SubmitButton({
  pending,
  children,
}: {
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
      {pending ? "Изпращане…" : children}
    </button>
  );
}

/** Скрито поле против ботове (вместо CAPTCHA). Името е HONEYPOT от form-state. */
export function Honeypot() {
  return (
    <input
      type="text"
      name="website"
      tabIndex={-1}
      autoComplete="off"
      className="hidden"
      aria-hidden
    />
  );
}
