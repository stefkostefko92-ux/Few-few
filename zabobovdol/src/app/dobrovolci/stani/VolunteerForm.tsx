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
import { submitVolunteer, type VolunteerState } from "./actions";

const initial: VolunteerState = { ok: false };

export function VolunteerForm() {
  const [state, action, pending] = useActionState(submitVolunteer, initial);
  const { errorRef, doneRef } = useFormFocus(state);

  if (state.ok) {
    return (
      <FormSuccess
        title="Благодарим ви! Записахме ви."
        headingRef={doneRef}
        action={
          <Link href="/dobrovolci" className="btn-primary">
            Към доброволците
          </Link>
        }
      >
        <p>
          Ще се свържем с вас и ще ви включим в мрежата след кратък преглед. Благодарим, че
          помагате на хората!
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
        <legend className="legend">За вас</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label="Име" error={f.error("name")} hint="Показва се в списъка на доброволците.">
            <input
              {...f.props("name", { hint: true })}
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              className={INPUT}
            />
          </Field>
          <Field name="area" label="Квартал или район" optional error={f.error("area")} hint="Напр. кв. „Миньор“.">
            <input {...f.props("area", { hint: true })} maxLength={80} className={INPUT} />
          </Field>
        </div>

        <Field
          name="skills"
          label="С какво можете да помогнете?"
          error={f.error("skills")}
          hint="Напр. телефон и интернет, пазар, документи, компания."
        >
          <input
            {...f.props("skills", { hint: true })}
            required
            minLength={3}
            maxLength={300}
            className={INPUT}
          />
        </Field>

        <Field name="about" label="Няколко думи за вас" optional error={f.error("about")}>
          <textarea {...f.props("about")} rows={3} maxLength={1500} className={INPUT} />
        </Field>
      </fieldset>

      <fieldset className="fieldset">
        <legend className="legend">Как да се свържем с вас</legend>
        <p className="text-base text-slate-600">
          Нужен е телефон или имейл. Виждат се само от екипа — за да ви свърже с хора, които се
          нуждаят от помощ.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="phone" label="Телефон" error={f.error("phone")}>
            <input
              {...f.props("phone")}
              type="tel"
              inputMode="tel"
              maxLength={40}
              autoComplete="tel"
              className={INPUT}
            />
          </Field>
          <Field name="email" label="Имейл" error={f.error("email")}>
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
      <PrivacyNote />

      <SubmitButton pending={pending}>Запишете ме</SubmitButton>
    </form>
  );
}
