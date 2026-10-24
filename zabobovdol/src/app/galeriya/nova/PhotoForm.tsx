"use client";

import { useActionState } from "react";
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
import { submitPhoto, type PhotoState } from "./actions";

const initial: PhotoState = { ok: false };

export function PhotoForm({ sendHint }: { sendHint: string }) {
  const [state, action, pending] = useActionState(submitPhoto, initial);
  const { errorRef, doneRef } = useFormFocus(state);

  if (state.ok) {
    return (
      <FormSuccess
        title="Благодарим! Снимката е получена."
        headingRef={doneRef}
        action={
          <Link href="/galeriya" className="btn-primary">
            Към галерията
          </Link>
        }
      >
        <p>Ще я прегледаме и след одобрение ще се появи в галерията — с кредит към вас като автор.</p>
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
        label="Какво е на снимката?"
        error={f.error("title")}
        hint="Напр. „Центърът на Бобов дол през зимата“."
      >
        <input
          {...f.props("title", { hint: true })}
          required
          minLength={3}
          maxLength={140}
          className={INPUT}
        />
      </Field>

      <Field
        name="author"
        label="Кой направи снимката?"
        error={f.error("author")}
        hint="Вашето име или името на автора — показва се под снимката."
      >
        <input
          {...f.props("author", { hint: true })}
          required
          minLength={2}
          maxLength={80}
          className={INPUT}
        />
      </Field>

      <fieldset className="fieldset">
        <legend className="legend">Снимката</legend>
        <Field
          name="photo"
          label="Качете снимка от телефона или компютъра"
          error={f.error("photo")}
          hint="Натиснете бутона и изберете снимка (JPG, PNG, до 8 MB). На телефон може да снимате и в момента."
        >
          <input
            id="photo"
            name="photo"
            type="file"
            accept="image/*"
            aria-invalid={f.error("photo") ? true : undefined}
            aria-describedby={["photo-hint", f.error("photo") ? "photo-error" : ""].filter(Boolean).join(" ")}
            className={`${INPUT} py-2 file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-700 file:px-4 file:py-2 file:font-semibold file:text-white`}
          />
        </Field>
        <Field name="imageUrl" label="Или връзка към снимка" optional error={f.error("imageUrl")} hint={sendHint}>
          <input
            {...f.props("imageUrl", { hint: true })}
            type="url"
            inputMode="url"
            maxLength={500}
            className={INPUT}
          />
        </Field>
      </fieldset>

      <Field
        name="contact"
        label="Ваш телефон или имейл"
        optional
        error={f.error("contact")}
        hint="Не се показва — само ако имаме въпрос за снимката."
      >
        <input {...f.props("contact", { hint: true })} maxLength={120} className={INPUT} />
      </Field>

      <Honeypot />

      <fieldset className="fieldset">
        <legend className="legend">Права и съгласие</legend>
        <p className="text-base text-slate-700">
          Като качите снимка, давате на сайта „За Бобов дол“ правото да я използва и на други
          места (например в страниците и материалите на проекта и в социалните мрежи). Винаги ще
          добавяме <strong>кредит с името на автора</strong>, което сте посочили.
        </p>
        <p className="text-base text-slate-700">
          С подаването потвърждавате, че вие сте направили снимката или имате право да я
          споделите. Снимките се преглеждат, преди да се покажат публично.
        </p>
        {/* Лични данни на изобразените лица (чл. 6 и чл. 14 GDPR): изисква се
            изрично потвърждение преди публикуване. */}
        <div>
          <label className={CHECK_ROW} htmlFor="peopleConsent">
            <input {...f.checkbox("peopleConsent")} type="checkbox" required className={CHECKBOX} />
            <span>
              Потвърждавам, че на снимката <strong>няма разпознаваеми хора</strong> или че{" "}
              <strong>изобразените лица са съгласни</strong> тя да бъде публикувана.
            </span>
          </label>
          <FieldError name="peopleConsent" error={f.error("peopleConsent")} />
        </div>
      </fieldset>

      <PrivacyNote />

      <SubmitButton pending={pending}>Изпратете снимката</SubmitButton>
    </form>
  );
}
