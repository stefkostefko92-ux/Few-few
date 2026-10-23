"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { BUSINESS_CATEGORY_LABELS } from "@/lib/categories";
import { PrivacyNote } from "@/components/PrivacyNote";
import { submitBusiness, type BusinessFormState, type BusinessFormValues } from "./actions";

const initial: BusinessFormState = { ok: false };

export type BusinessFormTarget = { slug: string; name: string };

export function BusinessForm({
  target,
  defaults,
}: {
  /** При поправка — бизнесът от каталога; иначе нов бизнес. */
  target?: BusinessFormTarget;
  defaults?: BusinessFormValues;
}) {
  const [state, action, pending] = useActionState(submitBusiness, initial);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.ok) doneRef.current?.focus();
    else if (state.error) errorRef.current?.focus();
  }, [state]);

  if (state.ok) {
    return (
      <div className="card max-w-xl bg-green-50" role="status">
        <h2 ref={doneRef} tabIndex={-1} className="text-xl font-bold text-slate-900 outline-none">
          Благодарим!
        </h2>
        <p className="mt-2 text-lg text-slate-800">
          {state.mode === "fix"
            ? "Получихме поправката. Ще проверим данните и ще ги обновим в каталога."
            : "Получихме данните за вашия бизнес. Ще се свържем с вас, за да ги проверим, и след това бизнесът ще се появи в каталога — безплатно."}
        </p>
        <Link href="/biznes" className="btn-primary mt-4">
          Към местния бизнес
        </Link>
      </div>
    );
  }

  // Стойностите след неуспешен опит са с предимство пред началните.
  const v: BusinessFormValues = { ...(defaults ?? {}), ...(state.values ?? {}) };
  const val = (k: string) => v[k] ?? "";

  return (
    <form key={state.attempt ?? 0} action={action} className="max-w-2xl space-y-5" noValidate>
      {state.error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-base text-red-700 outline-none"
        >
          {state.error}
        </div>
      )}

      {target && <input type="hidden" name="za" value={target.slug} />}

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-slate-900">
          {target ? "Данни в каталога" : "За бизнеса"}
        </legend>

        <div>
          <label className="label" htmlFor="name">
            Име на бизнеса *
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={120}
            className="input"
            defaultValue={val("name")}
            autoComplete="organization"
          />
        </div>

        <div>
          <label className="label" htmlFor="category">
            Вид *
          </label>
          <select id="category" name="category" required className="input" defaultValue={val("category") || "SHOP"}>
            {Object.entries(BUSINESS_CATEGORY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="description">
            С какво се занимавате (по избор)
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            maxLength={1500}
            className="input"
            aria-describedby="description-hint"
            defaultValue={val("description")}
          />
          <p id="description-hint" className="mt-1 text-sm text-slate-600">
            Например: „Хранителни стоки, пресен хляб всеки ден“.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="address">
            Адрес (по избор)
          </label>
          <input
            id="address"
            name="address"
            maxLength={200}
            className="input"
            placeholder="ул. …, Бобов дол"
            defaultValue={val("address")}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="phone">
              Телефон на бизнеса (по избор)
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              maxLength={40}
              className="input"
              defaultValue={val("phone")}
            />
          </div>
          <div>
            <label className="label" htmlFor="hours">
              Работно време (по избор)
            </label>
            <input
              id="hours"
              name="hours"
              maxLength={200}
              className="input"
              placeholder="Пон–Пет 8:00–18:00"
              defaultValue={val("hours")}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="websiteUrl">
              Уебсайт (по избор)
            </label>
            <input
              id="websiteUrl"
              name="websiteUrl"
              inputMode="url"
              maxLength={300}
              className="input"
              placeholder="www.primer.bg"
              defaultValue={val("websiteUrl")}
            />
          </div>
          <div>
            <label className="label" htmlFor="facebook">
              Страница във Facebook (по избор)
            </label>
            <input
              id="facebook"
              name="facebook"
              inputMode="url"
              maxLength={300}
              className="input"
              placeholder="facebook.com/…"
              defaultValue={val("facebook")}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <legend className="px-1 text-lg font-semibold text-slate-900">Как да се свържем с вас</legend>
        <p className="text-sm text-slate-600">
          Само за проверка, преди да публикуваме. Тези данни <strong>не</strong> се показват на сайта.
          Нужен е телефон или имейл.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="contactName">
              Вашето име
            </label>
            <input
              id="contactName"
              name="contactName"
              maxLength={80}
              className="input"
              autoComplete="name"
              defaultValue={val("contactName")}
            />
          </div>
          <div>
            <label className="label" htmlFor="contactPhone">
              Телефон
            </label>
            <input
              id="contactPhone"
              name="contactPhone"
              type="tel"
              inputMode="tel"
              maxLength={40}
              className="input"
              autoComplete="tel"
              defaultValue={val("contactPhone")}
            />
          </div>
          <div>
            <label className="label" htmlFor="contactEmail">
              Имейл
            </label>
            <input
              id="contactEmail"
              name="contactEmail"
              type="email"
              inputMode="email"
              maxLength={160}
              className="input"
              autoComplete="email"
              defaultValue={val("contactEmail")}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="note">
            {target ? "Какво друго да поправим? (по избор)" : "Бележка към нас (по избор)"}
          </label>
          <textarea
            id="note"
            name="note"
            rows={3}
            maxLength={1000}
            className="input"
            defaultValue={val("note")}
          />
        </div>
      </fieldset>

      {/* Honeypot — скрито поле за ботове */}
      <input
        type="text"
        name="homepage"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />

      <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-base text-slate-800">
        <input
          type="checkbox"
          name="consent"
          required
          defaultChecked={val("consent") === "on"}
          className="mt-1 h-6 w-6 shrink-0"
        />
        <span>
          Аз съм собственик или работя в този бизнес и съм съгласен данните за бизнеса (без данните за връзка с
          мен) да бъдат публикувани в каталога. *
        </span>
      </label>

      <PrivacyNote />

      <button type="submit" className="btn-primary min-h-[44px]" disabled={pending}>
        {pending ? "Изпращане…" : target ? "Изпратете поправката" : "Изпратете данните"}
      </button>
    </form>
  );
}
