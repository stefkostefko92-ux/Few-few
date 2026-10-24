"use client";

import { useActionState } from "react";
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
import { submitContact, type ContactState } from "./actions";

const initial: ContactState = { ok: false };

export function ContactForm() {
  const [state, action, pending] = useActionState(submitContact, initial);
  const { errorRef, doneRef } = useFormFocus(state);

  if (state.ok) {
    return (
      <FormSuccess title="Благодарим! Съобщението е изпратено." headingRef={doneRef}>
        <p>Ще ви отговорим, ако сте оставили телефон или имейл. Отговаряме в рамките на няколко работни дни.</p>
      </FormSuccess>
    );
  }

  const f = fields(state);

  return (
    <form key={state.attempt ?? 0} action={action} className={FORM} noValidate>
      <h2 className="h-sub">Изпратете ни съобщение</h2>
      <FormError state={state} innerRef={errorRef} />
      <RequiredNote />

      <Field
        name="message"
        label="Съобщение"
        error={f.error("message")}
        hint="Въпрос, предложение или какво да добавим. Поне 10 знака."
      >
        <textarea
          {...f.props("message", { hint: true })}
          required
          minLength={10}
          rows={6}
          maxLength={5000}
          className={INPUT}
        />
      </Field>

      <Field name="subject" label="Тема" optional error={f.error("subject")} hint="Напр. „нова услуга“.">
        <input {...f.props("subject", { hint: true })} maxLength={160} className={INPUT} />
      </Field>

      <fieldset className="fieldset">
        <legend className="legend">Ако искате отговор (по избор)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label="Вашето име" optional error={f.error("name")}>
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
        </div>
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
      </fieldset>

      <Honeypot />
      <PrivacyNote />

      <SubmitButton pending={pending}>Изпратете съобщението</SubmitButton>
    </form>
  );
}
