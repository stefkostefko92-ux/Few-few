"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { CheckCircle2, Phone } from "@/components/icons";
import { PrivacyNote } from "@/components/PrivacyNote";
import { SITE } from "@/lib/site";
import type { FormField } from "@/lib/obituary";
import { submitObituary, type ObituaryFormState } from "./actions";

const initial: ObituaryFormState = { ok: false };

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
  const alertRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  // След изпращане фокусът отива на съобщението — четецът го прочита веднага,
  // а на телефон човек вижда резултата, без да търси.
  useEffect(() => {
    if (state.ok) doneRef.current?.focus();
    else if (state.error) alertRef.current?.focus();
  }, [state]);

  if (state.ok) {
    return (
      <div
        ref={doneRef}
        tabIndex={-1}
        role="status"
        className="max-w-2xl rounded-2xl border border-slate-200 bg-green-50 p-6 outline-none"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-green-700" aria-hidden />
          <p className="text-lg font-semibold text-slate-800">Благодарим ви.</p>
        </div>
        <p className="mt-2 text-lg text-slate-700">
          Ще го прегледаме и публикуваме до 24 часа.
        </p>
        <p className="mt-2 text-slate-700">
          Ако имаме въпрос, ще ви се обадим на посочения телефон. Снимка може да ни
          изпратите по Viber на{" "}
          <a href={`tel:${SITE.contact.phone}`} className="font-semibold text-brand-700 underline underline-offset-2">
            {phone}
          </a>
          .
        </p>
        <Link href="/pomeni" className="btn-secondary mt-5">
          Към некролозите и помените
        </Link>
      </div>
    );
  }

  const v = state.values ?? {};
  const invalid = (f: FormField) => (state.field === f ? true : undefined);
  const describe = (f: FormField, hint?: string) =>
    [hint, state.field === f ? "pomen-error" : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <form key={state.attempt ?? 0} action={action} className="max-w-2xl space-y-6" noValidate>
      {state.error && (
        <div
          ref={alertRef}
          id="pomen-error"
          tabIndex={-1}
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-700 outline-none"
        >
          {state.error}
        </div>
      )}

      <p className="text-sm text-slate-600">Полетата със * са задължителни.</p>

      <fieldset aria-describedby={describe("kind")}>
        <legend className="label">Какво подавате? *</legend>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800">
            <input
              type="radio"
              name="kind"
              value="NECROLOGY"
              required
              defaultChecked={v.kind === "NECROLOGY"}
              className="mt-1 h-5 w-5 shrink-0 accent-brand-700"
            />
            <span>
              <strong>Некролог</strong>
              <span className="block text-sm text-slate-600">Тъжна вест — човекът почина наскоро.</span>
            </span>
          </label>
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800">
            <input
              type="radio"
              name="kind"
              value="MEMORIAL"
              defaultChecked={v.kind === "MEMORIAL"}
              className="mt-1 h-5 w-5 shrink-0 accent-brand-700"
            />
            <span>
              <strong>Помен</strong>
              <span className="block text-sm text-slate-600">40 дни, 6 месеца, година или друг помен.</span>
            </span>
          </label>
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="fullName">
          Име на починалия *
        </label>
        <input
          id="fullName"
          name="fullName"
          required
          maxLength={120}
          autoComplete="off"
          defaultValue={v.fullName}
          aria-invalid={invalid("fullName")}
          aria-describedby={describe("fullName")}
          className="input"
          placeholder="напр. Иван Петров Иванов"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="birthYear">
            Година на раждане
          </label>
          <input
            id="birthYear"
            name="birthYear"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            defaultValue={v.birthYear}
            aria-invalid={invalid("birthYear")}
            aria-describedby={describe("birthYear", "birthYear-hint")}
            className="input"
            placeholder="напр. 1945"
          />
          <p id="birthYear-hint" className="mt-1 text-sm text-slate-600">
            Само годината, с 4 цифри.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="deathDate">
            Дата на смъртта
          </label>
          <input
            id="deathDate"
            name="deathDate"
            type="date"
            defaultValue={v.deathDate}
            aria-invalid={invalid("deathDate")}
            aria-describedby={describe("deathDate")}
            className="input"
          />
        </div>
      </div>

      <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <legend className="px-1 text-base font-semibold text-slate-800">
          Погребение или помен — кога и къде
        </legend>
        <p className="text-sm text-slate-600">
          Ако още не знаете — оставете празно. Можем да го добавим по-късно.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ceremonyDate">
              Дата
            </label>
            <input
              id="ceremonyDate"
              name="ceremonyDate"
              type="date"
              defaultValue={v.ceremonyDate}
              aria-invalid={invalid("ceremonyDate")}
              aria-describedby={describe("ceremonyDate")}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="ceremonyTime">
              Час
            </label>
            <input
              id="ceremonyTime"
              name="ceremonyTime"
              type="time"
              defaultValue={v.ceremonyTime}
              aria-invalid={invalid("ceremonyTime")}
              aria-describedby={describe("ceremonyTime")}
              className="input"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="label" htmlFor="ceremonyPlace">
            Място
          </label>
          <input
            id="ceremonyPlace"
            name="ceremonyPlace"
            maxLength={160}
            defaultValue={v.ceremonyPlace}
            aria-invalid={invalid("ceremonyPlace")}
            aria-describedby={describe("ceremonyPlace")}
            className="input"
            placeholder="напр. църквата в Бобов дол, гробищния парк"
          />
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="text">
          Текст от близките
        </label>
        <textarea
          id="text"
          name="text"
          rows={5}
          maxLength={2000}
          defaultValue={v.text}
          aria-invalid={invalid("text")}
          aria-describedby={describe("text", "text-hint")}
          className="input"
          placeholder="напр. „Почина нашият скъп съпруг, баща и дядо. Поклон пред светлата му памет!“"
        />
        <p id="text-hint" className="mt-1 text-sm text-slate-600">
          Без телефони, адреси, ЕГН, линкове и банкови сметки — тук всичко се вижда от
          всички.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="fromFamily">
          Подпис
        </label>
        <input
          id="fromFamily"
          name="fromFamily"
          maxLength={120}
          defaultValue={v.fromFamily}
          aria-invalid={invalid("fromFamily")}
          aria-describedby={describe("fromFamily")}
          className="input"
          placeholder="напр. „От семейството“"
        />
      </div>

      <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <legend className="px-1 text-base font-semibold text-slate-800">
          Вашите данни — само за нас
        </legend>
        <p className="text-sm text-slate-600">
          Не се показват никъде. Ползваме ги само за да ви се обадим и да проверим
          обявата, преди да я публикуваме. Изтриват се до {retentionDays} дни.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="contactName">
              Вашето име *
            </label>
            <input
              id="contactName"
              name="contactName"
              required
              maxLength={80}
              autoComplete="name"
              defaultValue={v.contactName}
              aria-invalid={invalid("contactName")}
              aria-describedby={describe("contactName")}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="contactPhone">
              Вашият телефон *
            </label>
            <input
              id="contactPhone"
              name="contactPhone"
              type="tel"
              required
              maxLength={30}
              autoComplete="tel"
              defaultValue={v.contactPhone}
              aria-invalid={invalid("contactPhone")}
              aria-describedby={describe("contactPhone")}
              className="input"
              placeholder="напр. 0888 123 456"
            />
          </div>
        </div>
      </fieldset>

      {/* Honeypot против ботове */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <p>
          <strong>Какво публикуваме:</strong> името, годините, датата, погребението или
          помена (кога и къде), текста и подписа. Обявата се появява едва след като я
          прегледаме — обикновено до 24 часа.
        </p>
        <p className="mt-2">
          <strong>Снимка:</strong> не я качвайте тук. Ако желаете, изпратете я по Viber на{" "}
          {phone}, след като ви се обадим.
        </p>
        <p className="mt-2">
          <strong>Сваляне:</strong> по молба на близките сваляме или поправяме обявата до
          72 часа — на {phone} или на {SITE.contact.email}.
        </p>
      </div>

      <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-base text-slate-800">
        <input
          type="checkbox"
          name="consent"
          required
          defaultChecked={v.consent === "on"}
          aria-invalid={invalid("consent")}
          aria-describedby={describe("consent")}
          className="mt-1 h-5 w-5 shrink-0 accent-brand-700"
        />
        <span>{consentText}. *</span>
      </label>

      <PrivacyNote />

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Изпращане…" : "Изпрати за преглед"}
        </button>
        <a href={`tel:${SITE.contact.phone}`} className="btn-secondary">
          <Phone className="h-5 w-5" aria-hidden />
          Или се обадете: {phone}
        </a>
      </div>
    </form>
  );
}
