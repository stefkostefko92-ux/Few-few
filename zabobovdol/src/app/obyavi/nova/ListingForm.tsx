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
import { LISTING_TYPE_LABELS } from "@/lib/categories";
import { submitListing, type SubmitState } from "./actions";

const initial: SubmitState = { ok: false };

export function ListingForm() {
  const [state, action, pending] = useActionState(submitListing, initial);
  const { errorRef, doneRef } = useFormFocus(state);

  if (state.ok) {
    return (
      <FormSuccess
        title="Благодарим! Обявата е получена."
        headingRef={doneRef}
        action={
          <Link href="/obyavi" className="btn-primary">
            Към обявите
          </Link>
        }
      >
        <p>Ще я прегледаме и ще я публикуваме след кратък преглед.</p>
      </FormSuccess>
    );
  }

  // Без предварително избран вид (както /signali): който не пипне полето, не
  // изпраща „Продавам“ по погрешка — получава „Изберете вид на обявата.“
  const f = fields(state);

  return (
    <form key={state.attempt ?? 0} action={action} className={FORM} noValidate>
      <FormError state={state} innerRef={errorRef} />
      <RequiredNote />

      <fieldset className="fieldset">
        <legend className="legend">Обявата</legend>
        <Field name="title" label="Заглавие" error={f.error("title")} hint="Накратко, напр. „Продавам детско колело“.">
          <input
            {...f.props("title", { hint: true })}
            required
            minLength={3}
            maxLength={120}
            className={INPUT}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="type" label="Вид" error={f.error("type")}>
            <select {...f.props("type")} required className={INPUT}>
              <option value="" disabled>
                — Изберете вид —
              </option>
              {Object.entries(LISTING_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field
            name="price"
            label="Цена"
            optional
            error={f.error("price")}
            hint="Напр. 25 € или „по договаряне“."
          >
            <input {...f.props("price", { hint: true })} maxLength={60} className={INPUT} />
          </Field>
        </div>

        <Field
          name="description"
          label="Описание"
          error={f.error("description")}
          hint="Какво предлагате или търсите, в какво състояние е, къде е. Поне 10 знака."
        >
          <textarea
            {...f.props("description", { hint: true })}
            required
            minLength={10}
            rows={6}
            maxLength={4000}
            className={INPUT}
          />
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
              maxLength={120}
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
