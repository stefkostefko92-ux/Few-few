"use client";

import { useActionState } from "react";
import { ExternalLink } from "@/components/icons";
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
import { submitAdRequest, type AdRequestState } from "@/app/reklama/actions";
import { PrivacyNote } from "@/components/PrivacyNote";

const initial: AdRequestState = { ok: false };

export function AdRequestForm({
  paymentUrl,
  priceText,
}: {
  paymentUrl: string;
  /** Месечната цена за показване („20 €“). */
  priceText: string;
}) {
  const [state, action, pending] = useActionState(submitAdRequest, initial);
  const { errorRef, doneRef } = useFormFocus(state);

  if (state.ok) {
    // Връзката за плащане е САМО тук — след заявката и с изричното „след
    // уговорка“ (страницата първо казва да се свържем, после да се плати).
    return (
      <FormSuccess
        title="Благодарим! Получихме заявката ви."
        headingRef={doneRef}
        action={
          <a href={paymentUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">
            <ExternalLink className="h-5 w-5 shrink-0" aria-hidden />
            Платете {priceText} с Revolut (след уговорка)
            <span className="sr-only"> (отваря се в нов прозорец)</span>
          </a>
        }
      >
        <p>
          <strong>Първо ще се свържем с вас</strong>, за да уточним текста, изображението и
          връзката на рекламата.
        </p>
        <p className="callout-note rounded-xl text-base">
          <strong>Важно:</strong> платете таксата от {priceText} на месец{" "}
          <strong>едва след като се свържем и се уговорим</strong>.
        </p>
      </FormSuccess>
    );
  }

  const f = fields(state);

  return (
    <form key={state.attempt ?? 0} action={action} className={FORM} noValidate>
      <FormError state={state} innerRef={errorRef} />
      <RequiredNote />

      <Field name="fullName" label="Три имена" error={f.error("fullName")} hint="Име, презиме и фамилия.">
        <input
          {...f.props("fullName", { hint: true })}
          required
          minLength={5}
          maxLength={120}
          autoComplete="name"
          className={INPUT}
        />
      </Field>

      <fieldset className="fieldset">
        <legend className="legend">Как да се свържем с вас</legend>
        <p className="text-base text-slate-600">Нужен е имейл или телефон.</p>
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
      </fieldset>

      <Field
        name="message"
        label="Съобщение"
        optional
        error={f.error("message")}
        hint="Каква реклама желаете — бизнес, услуга, връзка към сайт или телефон."
      >
        <textarea {...f.props("message", { hint: true })} rows={3} maxLength={2000} className={INPUT} />
      </Field>

      <Honeypot />
      <PrivacyNote />

      <SubmitButton pending={pending}>Изпратете заявката</SubmitButton>
    </form>
  );
}
