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
import { submitRideshare, type RideState } from "./actions";

const initial: RideState = { ok: false };

export function RideForm() {
  const [state, action, pending] = useActionState(submitRideshare, initial);
  const { errorRef, doneRef } = useFormFocus(state);

  if (state.ok) {
    return (
      <FormSuccess
        title="Благодарим! Обявата е получена."
        headingRef={doneRef}
        action={
          <Link href="/spodeleno-patuvane" className="btn-primary">
            Към споделените пътувания
          </Link>
        }
      >
        <p>Ще се публикува след кратък преглед. Приятен и споделен път!</p>
      </FormSuccess>
    );
  }

  const f = fields(state, { kind: "OFFER" });

  return (
    <form key={state.attempt ?? 0} action={action} className={FORM} noValidate>
      <FormError state={state} innerRef={errorRef} />
      <RequiredNote />

      <fieldset className="fieldset">
        <legend className="legend">Пътуването</legend>
        <Field name="kind" label="Вид" error={f.error("kind")}>
          <select {...f.props("kind")} required className={INPUT}>
            <option value="OFFER">Предлагам място в колата (шофьор)</option>
            <option value="NEED">Търся превоз / спътници</option>
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="routeFrom" label="Откъде" error={f.error("routeFrom")} hint="Напр. Бобов дол.">
            <input
              {...f.props("routeFrom", { hint: true })}
              required
              minLength={2}
              maxLength={80}
              className={INPUT}
            />
          </Field>
          <Field name="routeTo" label="Докъде" error={f.error("routeTo")} hint="Напр. Дупница.">
            <input
              {...f.props("routeTo", { hint: true })}
              required
              minLength={2}
              maxLength={80}
              className={INPUT}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="schedule" label="Кога" optional error={f.error("schedule")} hint="Напр. делник, 7:30.">
            <input {...f.props("schedule", { hint: true })} maxLength={120} className={INPUT} />
          </Field>
          <Field name="seats" label="Свободни места" optional error={f.error("seats")} hint="Напр. 3.">
            <input
              {...f.props("seats", { hint: true })}
              inputMode="numeric"
              maxLength={40}
              className={INPUT}
            />
          </Field>
          <Field name="costNote" label="Дял от разхода" optional error={f.error("costNote")} hint="Напр. по 2 €.">
            <input {...f.props("costNote", { hint: true })} maxLength={120} className={INPUT} />
          </Field>
        </div>

        <Field name="description" label="Допълнително" optional error={f.error("description")}>
          <textarea {...f.props("description")} rows={4} maxLength={2000} className={INPUT} />
        </Field>
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

      <SubmitButton pending={pending}>Изпратете обявата</SubmitButton>
    </form>
  );
}
