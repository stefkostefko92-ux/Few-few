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
import { submitMemory, type MemoryState } from "./actions";

const initial: MemoryState = { ok: false };

export function MemoryForm() {
  const [state, action, pending] = useActionState(submitMemory, initial);
  const { errorRef, doneRef } = useFormFocus(state);

  if (state.ok) {
    return (
      <FormSuccess
        title="Благодарим за спомена!"
        headingRef={doneRef}
        action={
          <Link href="/spomeni" className="btn-primary">
            Към „Спомени“
          </Link>
        }
      >
        <p>
          Получихме го и ще го публикуваме след кратък преглед. Така заедно пазим историята на
          Бобов дол жива.
        </p>
      </FormSuccess>
    );
  }

  const f = fields(state);

  return (
    <form key={state.attempt ?? 0} action={action} className={FORM} noValidate>
      <FormError state={state} innerRef={errorRef} />
      <RequiredNote />

      <Field
        name="title"
        label="Заглавие"
        error={f.error("title")}
        hint="Напр. „Празникът на миньора през 80-те“."
      >
        <input
          {...f.props("title", { hint: true })}
          required
          minLength={4}
          maxLength={140}
          className={INPUT}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="author" label="Вашето име" optional error={f.error("author")} hint="Показва се под спомена.">
          <input
            {...f.props("author", { hint: true })}
            maxLength={80}
            autoComplete="name"
            className={INPUT}
          />
        </Field>
        <Field name="period" label="Период" optional error={f.error("period")} hint="Напр. 1980-те.">
          <input {...f.props("period", { hint: true })} maxLength={60} className={INPUT} />
        </Field>
      </div>

      <Field
        name="content"
        label="Спомен"
        error={f.error("content")}
        hint="Разкажете със свои думи. Имате стара снимка? Споменете в текста и ще я добавим след връзка с вас."
      >
        <textarea
          {...f.props("content", { hint: true })}
          required
          minLength={20}
          rows={8}
          maxLength={6000}
          className={INPUT}
        />
      </Field>

      <Honeypot />
      <PrivacyNote lead="Споделяйте само спомени, които искате да са публични." />

      <SubmitButton pending={pending}>Споделете спомена</SubmitButton>
    </form>
  );
}
