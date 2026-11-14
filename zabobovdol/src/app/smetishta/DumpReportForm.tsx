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
import { submitDumpReport, type DumpState } from "./actions";

const initial: DumpState = { ok: false };

export function DumpReportForm({ photoHint }: { photoHint: string }) {
  const [state, action, pending] = useActionState(submitDumpReport, initial);
  const { errorRef, doneRef } = useFormFocus(state);

  if (state.ok) {
    return (
      <FormSuccess
        title="Благодарим! Сигналът е получен."
        headingRef={doneRef}
        action={
          <Link href="/smetishta#podadeni" className="btn-primary">
            Към подадените сигнали
          </Link>
        }
      >
        <p>
          Ще го прегледаме и след одобрение ще се появи в списъка по-долу, за да го видят и
          съседите, и общината.
        </p>
      </FormSuccess>
    );
  }

  const f = fields(state);

  return (
    <form key={state.attempt ?? 0} action={action} className={FORM} noValidate>
      <FormError state={state} innerRef={errorRef} />
      <RequiredNote />

      {/* Същата структура като /signali: група „Сметището“ и група „Данни за връзка“. */}
      <fieldset className="fieldset">
        <legend className="legend">Сметището</legend>
        <Field
          name="location"
          label="Къде е сметището?"
          error={f.error("location")}
          hint="Улица, квартал или ориентир — напр. „край пътя за с. Дяково“."
        >
          <input
            {...f.props("location", { hint: true })}
            required
            minLength={3}
            maxLength={160}
            className={INPUT}
          />
        </Field>

        <Field
          name="description"
          label="Описание"
          error={f.error("description")}
          hint="Какви отпадъци, колко голямо е, от кога е там, има ли опасност."
        >
          <textarea
            {...f.props("description", { hint: true })}
            required
            minLength={10}
            rows={5}
            maxLength={3000}
            className={INPUT}
          />
        </Field>

        <Field
          name="photoUrl"
          label="Връзка към снимка"
          optional
          error={f.error("photoUrl")}
          hint={photoHint}
        >
          <input
            {...f.props("photoUrl", { hint: true })}
            type="url"
            inputMode="url"
            maxLength={400}
            className={INPUT}
          />
        </Field>
      </fieldset>

      <fieldset className="fieldset">
        <legend className="legend">Данни за връзка (по избор)</legend>
        <p className="text-base text-slate-600">Не се показват публично.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="name" label="Име" optional error={f.error("name")}>
            <input {...f.props("name")} maxLength={80} autoComplete="name" className={INPUT} />
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
      <PrivacyNote lead="Сигналите се преглеждат, преди да се покажат публично." />

      <SubmitButton pending={pending}>Изпратете сигнала</SubmitButton>
    </form>
  );
}
