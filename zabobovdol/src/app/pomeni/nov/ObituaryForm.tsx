"use client";

import { useActionState, useMemo } from "react";
import Link from "next/link";
import {
  CHECKBOX,
  CHECK_ROW,
  FORM,
  Field,
  FieldError,
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
import { PhoneButton } from "@/components/PhoneButton";
import { TelLink } from "@/components/TelLink";
import { SITE } from "@/lib/site";
import type { FormState } from "@/lib/form-state";
import { submitObituary, type ObituaryFormState } from "./actions";

const initial: ObituaryFormState = { ok: false };

// Радио-карта (некролог / помен) — цялата карта е цел за докосване.
const RADIO_CARD =
  "flex min-h-tap cursor-pointer items-start gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800 has-[:checked]:border-slate-700 has-[:checked]:bg-slate-50 dark:has-[:checked]:border-slate-300";

// Текстовете идват като props от сървърната страница — така чистата логика
// (със Zod) не влиза в браузърния бъндъл.
export function ObituaryForm({
  phone,
  consentText,
  retentionDays,
}: {
  /** Телефонът на сайта, четим вид („0877 414 874“). */
  phone: string;
  consentText: string;
  retentionDays: number;
}) {
  const [state, action, pending] = useActionState(submitObituary, initial);
  // Проверката на некролога връща една грешка с полето ѝ — същият вид като
  // останалите форми: под полето и в обобщението най-горе.
  const view = useMemo<FormState>(
    () => ({
      ok: state.ok,
      attempt: state.attempt,
      values: state.values as Record<string, string> | undefined,
      error: state.field ? undefined : state.error,
      fieldErrors: state.field && state.error ? { [state.field]: state.error } : undefined,
    }),
    [state],
  );
  const { errorRef, doneRef } = useFormFocus(view);

  if (state.ok) {
    return (
      <FormSuccess
        title="Благодарим ви."
        headingRef={doneRef}
        action={
          <Link href="/pomeni" className="btn-secondary">
            Към некролозите и помените
          </Link>
        }
      >
        <p>Ще го прегледаме и публикуваме до 24 часа.</p>
        <p className="text-base text-slate-700">
          Ако имаме въпрос, ще ви се обадим на посочения телефон. Снимка може да ни изпратите по
          Viber на{" "}
          <TelLink phone={SITE.contact.phone} className="link">
            {phone}
          </TelLink>
          .
        </p>
      </FormSuccess>
    );
  }

  const f = fields(view);
  const kind = f.value("kind");

  return (
    <form key={state.attempt ?? 0} action={action} className={FORM} noValidate>
      <FormError state={view} innerRef={errorRef} />
      <RequiredNote />

      <fieldset aria-describedby={f.error("kind") ? "kind-error" : undefined}>
        <legend className="label">Какво подавате?</legend>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          <label className={RADIO_CARD}>
            <input
              id="kind"
              type="radio"
              name="kind"
              value="NECROLOGY"
              required
              defaultChecked={kind === "NECROLOGY"}
              className="mt-1 h-5 w-5 shrink-0 accent-slate-700"
            />
            <span>
              <strong>Некролог</strong>
              <span className="block text-base text-slate-600">Тъжна вест — човекът почина наскоро.</span>
            </span>
          </label>
          <label className={RADIO_CARD}>
            <input
              type="radio"
              name="kind"
              value="MEMORIAL"
              defaultChecked={kind === "MEMORIAL"}
              className="mt-1 h-5 w-5 shrink-0 accent-slate-700"
            />
            <span>
              <strong>Помен</strong>
              <span className="block text-base text-slate-600">40 дни, 6 месеца, година или друг помен.</span>
            </span>
          </label>
        </div>
        <FieldError name="kind" error={f.error("kind")} />
      </fieldset>

      <Field name="fullName" label="Име на починалия" error={f.error("fullName")} hint="Напр. Иван Петров Иванов.">
        <input
          {...f.props("fullName", { hint: true })}
          required
          minLength={3}
          maxLength={120}
          autoComplete="off"
          className={INPUT}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="birthYear"
          label="Година на раждане"
          optional
          error={f.error("birthYear")}
          hint="Само годината, с 4 цифри, напр. 1945."
        >
          <input
            {...f.props("birthYear", { hint: true })}
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            className={INPUT}
          />
        </Field>
        <Field name="deathDate" label="Дата на смъртта" optional error={f.error("deathDate")}>
          <input {...f.props("deathDate")} type="date" className={INPUT} />
        </Field>
      </div>

      <fieldset className="fieldset">
        <legend className="legend">Погребение или помен — кога и къде (по избор)</legend>
        <p className="text-base text-slate-600">
          Ако още не знаете — оставете празно. Можем да го добавим по-късно.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="ceremonyDate" label="Дата" optional error={f.error("ceremonyDate")}>
            <input {...f.props("ceremonyDate")} type="date" className={INPUT} />
          </Field>
          <Field name="ceremonyTime" label="Час" optional error={f.error("ceremonyTime")}>
            <input {...f.props("ceremonyTime")} type="time" className={INPUT} />
          </Field>
        </div>
        <Field
          name="ceremonyPlace"
          label="Място"
          optional
          error={f.error("ceremonyPlace")}
          hint="Напр. църквата в Бобов дол, гробищния парк."
        >
          <input {...f.props("ceremonyPlace", { hint: true })} maxLength={160} className={INPUT} />
        </Field>
      </fieldset>

      <Field
        name="text"
        label="Текст от близките"
        optional
        error={f.error("text")}
        hint="Без телефони, адреси, ЕГН, линкове и банкови сметки — тук всичко се вижда от всички."
      >
        <textarea {...f.props("text", { hint: true })} rows={5} maxLength={2000} className={INPUT} />
      </Field>

      <Field name="fromFamily" label="Подпис" optional error={f.error("fromFamily")} hint="Напр. „От семейството“.">
        <input {...f.props("fromFamily", { hint: true })} maxLength={120} className={INPUT} />
      </Field>

      <fieldset className="fieldset">
        <legend className="legend">Вашите данни — само за нас</legend>
        <p className="text-base text-slate-600">
          Не се показват никъде. Ползваме ги само за да ви се обадим и да проверим обявата, преди
          да я публикуваме. Изтриват се до {retentionDays} дни.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="contactName" label="Вашето име" error={f.error("contactName")}>
            <input
              {...f.props("contactName")}
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              className={INPUT}
            />
          </Field>
          <Field name="contactPhone" label="Вашият телефон" error={f.error("contactPhone")} hint="Напр. 0888 123 456.">
            <input
              {...f.props("contactPhone", { hint: true })}
              type="tel"
              required
              maxLength={30}
              autoComplete="tel"
              className={INPUT}
            />
          </Field>
        </div>
      </fieldset>

      <Honeypot />

      <div>
        <label className={CHECK_ROW} htmlFor="consent">
          <input {...f.checkbox("consent")} type="checkbox" required className={CHECKBOX} />
          <span>{consentText}.</span>
        </label>
        <FieldError name="consent" error={f.error("consent")} />
      </div>

      <PrivacyNote />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SubmitButton pending={pending}>Изпратете за преглед</SubmitButton>
        <PhoneButton phone={SITE.contact.phone} label="Или се обадете:" />
      </div>
    </form>
  );
}
