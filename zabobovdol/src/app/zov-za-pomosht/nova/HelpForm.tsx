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
import { submitHelpCause, type HelpState } from "./actions";

const initial: HelpState = { ok: false };

export function HelpForm() {
  const [state, action, pending] = useActionState(submitHelpCause, initial);
  const { errorRef, doneRef } = useFormFocus(state);

  if (state.ok) {
    return (
      <FormSuccess
        title="Благодарим! Получихме зова."
        headingRef={doneRef}
        action={
          <Link href="/zov-za-pomosht" className="btn-primary">
            Към „Зов за помощ“
          </Link>
        }
      >
        <p>Ще го публикуваме след кратък преглед. Благодарим, че помагате на общността!</p>
      </FormSuccess>
    );
  }

  const f = fields(state, { kind: "NEED" });

  return (
    <form key={state.attempt ?? 0} action={action} className={FORM} noValidate>
      <FormError state={state} innerRef={errorRef} />
      <RequiredNote />

      <fieldset className="fieldset">
        <legend className="legend">Зовът</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="kind" label="Вид" error={f.error("kind")}>
            <select {...f.props("kind")} required className={INPUT}>
              <option value="NEED">Търся помощ за възрастен човек</option>
              <option value="OFFER">Предлагам помощ / дарение</option>
            </select>
          </Field>
          <Field name="location" label="Място или квартал" optional error={f.error("location")}>
            <input {...f.props("location")} maxLength={120} className={INPUT} />
          </Field>
        </div>

        <Field name="title" label="Заглавие" error={f.error("title")} hint="Накратко какво е нужно или какво предлагате.">
          <input
            {...f.props("title", { hint: true })}
            required
            minLength={4}
            maxLength={140}
            className={INPUT}
          />
        </Field>

        <Field
          name="beneficiary"
          label="За кого е"
          optional
          error={f.error("beneficiary")}
          hint="Напр. „самотна баба от кв. Миньор“ — без име."
        >
          <input {...f.props("beneficiary", { hint: true })} maxLength={120} className={INPUT} />
        </Field>

        <Field
          name="description"
          label="Описание"
          error={f.error("description")}
          hint="Каква помощ е нужна или какво предлагате. Поне 15 знака."
        >
          <textarea
            {...f.props("description", { hint: true })}
            required
            minLength={15}
            rows={6}
            maxLength={4000}
            className={INPUT}
          />
        </Field>
        {/* Защита на чувствителни данни (чл. 9 GDPR): публикацията е публична. */}
        <p className="callout-note rounded-xl text-base text-slate-800">
          <strong>Важно:</strong> обявата е публична. Ако пишете за друг човек, първо вземете
          съгласието му. <strong>Не посочвайте</strong> здравословно състояние, диагнози или други
          чувствителни данни — опишете само каква помощ е нужна.
        </p>
      </fieldset>

      <fieldset className="fieldset">
        <legend className="legend">Как да ви намерят</legend>
        <p className="text-base text-slate-600">
          Нужен е телефон или имейл. Показват се в обявата, за да се свържат с вас.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="contactName" label="Име" optional error={f.error("contactName")}>
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
      </fieldset>

      <Honeypot />
      <PrivacyNote lead="С подаването приемате обявата да бъде видима публично." />

      <SubmitButton pending={pending}>Изпратете зова</SubmitButton>
    </form>
  );
}
