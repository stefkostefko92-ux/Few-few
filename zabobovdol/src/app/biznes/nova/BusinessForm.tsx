"use client";

import { useActionState } from "react";
import Link from "next/link";
import { BUSINESS_CATEGORY_LABELS } from "@/lib/categories";
import {
  CHECKBOX,
  CHECK_ROW,
  FORM,
  Field,
  FieldError,
  FormError,
  FormSuccess,
  INPUT,
  RequiredNote,
  SubmitButton,
  fields,
  useFormFocus,
} from "@/components/FormKit";
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
  const { errorRef, doneRef } = useFormFocus(state);

  if (state.ok) {
    return (
      <FormSuccess
        title="Благодарим!"
        headingRef={doneRef}
        action={
          <Link href="/biznes" className="btn-primary">
            Към местния бизнес
          </Link>
        }
      >
        <p>
          {state.mode === "fix"
            ? "Получихме поправката. Ще проверим данните и ще ги обновим в каталога."
            : "Получихме данните за вашия бизнес. Ще се свържем с вас, за да ги проверим, и след това бизнесът ще се появи в каталога — безплатно."}
        </p>
      </FormSuccess>
    );
  }

  // Стойностите след неуспешен опит са с предимство пред началните.
  // Видът не е предварително избран (както /signali) — иначе всеки, който не
  // пипне полето, се записва като „Магазин“. При поправка (?za=) идва от записа.
  const f = fields(state, { ...(defaults ?? {}) });

  return (
    <form key={state.attempt ?? 0} action={action} className={FORM} noValidate>
      {/* Скритите полета — само в началото, при скритите на React: FORM нулира
          отстъпа на първия видим ред след тях, а скрито поле по средата би
          изяло отстъпа на следващия fieldset. */}
      {target && <input type="hidden" name="za" value={target.slug} />}
      <FormError state={state} innerRef={errorRef} />
      <RequiredNote />

      <fieldset className="fieldset">
        <legend className="legend">{target ? "Данни в каталога" : "За бизнеса"}</legend>

        <Field name="name" label="Име на бизнеса" error={f.error("name")}>
          <input
            {...f.props("name")}
            required
            minLength={2}
            maxLength={120}
            autoComplete="organization"
            className={INPUT}
          />
        </Field>

        <Field name="category" label="Вид" error={f.error("category")}>
          <select {...f.props("category")} required className={INPUT}>
            <option value="" disabled>
              — Изберете вид —
            </option>
            {Object.entries(BUSINESS_CATEGORY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          name="description"
          label="С какво се занимавате"
          optional
          error={f.error("description")}
          hint="Например: „Хранителни стоки, пресен хляб всеки ден“."
        >
          <textarea
            {...f.props("description", { hint: true })}
            rows={4}
            maxLength={1500}
            className={INPUT}
          />
        </Field>

        <Field name="address" label="Адрес" optional error={f.error("address")} hint="Напр. ул. …, Бобов дол.">
          <input {...f.props("address", { hint: true })} maxLength={200} className={INPUT} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="phone" label="Телефон на бизнеса" optional error={f.error("phone")}>
            <input
              {...f.props("phone")}
              type="tel"
              inputMode="tel"
              maxLength={40}
              className={INPUT}
            />
          </Field>
          <Field name="hours" label="Работно време" optional error={f.error("hours")} hint="Напр. Пон–Пет 8:00–18:00.">
            <input {...f.props("hours", { hint: true })} maxLength={200} className={INPUT} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="websiteUrl" label="Уебсайт" optional error={f.error("websiteUrl")} hint="Напр. www.primer.bg.">
            <input
              {...f.props("websiteUrl", { hint: true })}
              inputMode="url"
              maxLength={300}
              className={INPUT}
            />
          </Field>
          <Field
            name="facebook"
            label="Страница във Facebook"
            optional
            error={f.error("facebook")}
            hint="Напр. facebook.com/…"
          >
            <input
              {...f.props("facebook", { hint: true })}
              inputMode="url"
              maxLength={300}
              className={INPUT}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend className="legend">Как да се свържем с вас</legend>
        <p className="text-base text-slate-600">
          Само за проверка, преди да публикуваме. Тези данни <strong>не</strong> се показват на
          сайта. Нужен е телефон или имейл.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="contactName" label="Вашето име" optional error={f.error("contactName")}>
            <input {...f.props("contactName")} maxLength={80} autoComplete="name" className={INPUT} />
          </Field>
          <Field name="contactPhone" label="Телефон" error={f.error("contactPhone")}>
            <input
              {...f.props("contactPhone")}
              type="tel"
              inputMode="tel"
              maxLength={40}
              autoComplete="tel"
              className={INPUT}
            />
          </Field>
          <Field name="contactEmail" label="Имейл" error={f.error("contactEmail")}>
            <input
              {...f.props("contactEmail")}
              type="email"
              inputMode="email"
              maxLength={160}
              autoComplete="email"
              className={INPUT}
            />
          </Field>
        </div>

        <Field
          name="note"
          label={target ? "Какво друго да поправим?" : "Бележка към нас"}
          optional
          error={f.error("note")}
        >
          <textarea {...f.props("note")} rows={3} maxLength={1000} className={INPUT} />
        </Field>
      </fieldset>

      {/* Honeypot — скрито поле за ботове (тук се казва „homepage“). */}
      <input
        type="text"
        name="homepage"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />

      <div>
        <label className={CHECK_ROW} htmlFor="consent">
          <input {...f.checkbox("consent")} type="checkbox" required className={CHECKBOX} />
          <span>
            Аз съм собственик или работя в този бизнес и съм съгласен данните за бизнеса (без
            данните за връзка с мен) да бъдат публикувани в каталога.
          </span>
        </label>
        <FieldError name="consent" error={f.error("consent")} />
      </div>

      <PrivacyNote />

      <SubmitButton pending={pending}>{target ? "Изпратете поправката" : "Изпратете данните"}</SubmitButton>
    </form>
  );
}
