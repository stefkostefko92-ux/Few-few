"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  FORM,
  Field,
  FormError,
  FormSuccess,
  Honeypot,
  INPUT,
  RequiredNote,
  SubmitButton,
  fields,
  useFormFocus,
} from "@/components/FormKit";
import { PrivacyNote } from "@/components/PrivacyNote";
import { COMPLAINT_CATEGORIES } from "./categories";
import { submitComplaint, type ComplaintState } from "./actions";

const initial: ComplaintState = { ok: false };

export function SignaliForm() {
  const [state, action, pending] = useActionState(submitComplaint, initial);
  const { errorRef, doneRef } = useFormFocus(state);

  if (state.ok) {
    return (
      <FormSuccess
        title="Благодарим! Сигналът е получен."
        headingRef={doneRef}
        action={
          <Link href="/" className="btn-primary">
            Към началото
          </Link>
        }
      >
        <p>
          Сигналът е регистриран
          {state.forwarded ? " и е препратен към общината." : " и предстои да бъде препратен към общината."}
        </p>
        <p>
          Код за проследяване:{" "}
          <strong className="whitespace-nowrap font-mono text-xl font-bold text-brand-700">
            {state.refCode}
          </strong>
        </p>
        <p className="text-base text-slate-700">
          Запазете този код. Можете да го споменете, ако се свържете с нас или с общината за
          статуса на сигнала.
        </p>
      </FormSuccess>
    );
  }

  const f = fields(state);

  return (
    <form key={state.attempt ?? 0} action={action} className={FORM} noValidate>
      <FormError state={state} innerRef={errorRef} />
      <RequiredNote />

      <fieldset className="fieldset">
        <legend className="legend">Проблемът</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="category" label="Категория" error={f.error("category")}>
            <select {...f.props("category")} required className={INPUT}>
              <option value="" disabled>
                — Изберете категория —
              </option>
              {COMPLAINT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field
            name="location"
            label="Къде е проблемът"
            optional
            error={f.error("location")}
            hint="Улица, квартал или ориентир."
          >
            <input {...f.props("location", { hint: true })} maxLength={200} className={INPUT} />
          </Field>
        </div>

        <Field name="subject" label="Заглавие" error={f.error("subject")} hint="Накратко, напр. „Дупка на ул. …“.">
          <input
            {...f.props("subject", { hint: true })}
            required
            minLength={3}
            maxLength={160}
            className={INPUT}
          />
        </Field>

        <Field
          name="message"
          label="Описание на проблема"
          error={f.error("message")}
          hint="Къде, какво и от кога е проблемът. Поне 15 знака."
        >
          <textarea
            {...f.props("message", { hint: true })}
            required
            minLength={15}
            rows={6}
            maxLength={5000}
            className={INPUT}
          />
        </Field>
      </fieldset>

      <fieldset className="fieldset">
        <legend className="legend">Данни за връзка (по избор)</legend>
        <p className="text-base text-slate-600">
          Помагат, ако общината има въпрос или иска да ви отговори.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="name" label="Име" optional error={f.error("name")}>
            <input {...f.props("name")} maxLength={120} autoComplete="name" className={INPUT} />
          </Field>
          <Field name="phone" label="Телефон" optional error={f.error("phone")}>
            <input
              {...f.props("phone")}
              type="tel"
              inputMode="tel"
              maxLength={40}
              autoComplete="tel"
              className={INPUT}
            />
          </Field>
          <Field name="email" label="Имейл" optional error={f.error("email")}>
            <input
              {...f.props("email")}
              type="email"
              inputMode="email"
              maxLength={160}
              autoComplete="email"
              className={INPUT}
            />
          </Field>
        </div>
      </fieldset>

      <Honeypot />

      <PrivacyNote lead="С подаването приемате сигналът и посочените данни за връзка да бъдат предадени към съответната институция." />

      <SubmitButton pending={pending}>Изпратете сигнала</SubmitButton>
    </form>
  );
}
