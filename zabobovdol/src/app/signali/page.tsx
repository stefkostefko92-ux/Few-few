"use client";

import { useActionState } from "react";
import Link from "next/link";
import { PageHero } from "@/components/ui";
import { submitComplaint, type ComplaintState } from "./actions";

const initial: ComplaintState = { ok: false };

const CATEGORIES = [
  "Пътища и тротоари",
  "Улично осветление",
  "Отпадъци и чистота",
  "ВиК / водоснабдяване",
  "Шум и нарушения",
  "Бездомни животни",
  "Незаконно строителство",
  "Паркове и зеленини",
  "Друго",
];

export default function SignaliPage() {
  const [state, action, pending] = useActionState(submitComplaint, initial);

  if (state.ok) {
    return (
      <>
        <PageHero
          title="Сигналът е получен"
          crumbs={[{ name: "Сигнали до общината", path: "/signali" }]}
        />
        <div className="container-content py-10">
          <div className="card max-w-xl bg-green-50">
            <p className="text-lg text-slate-800">
              Благодарим! Вашият сигнал е регистриран
              {state.forwarded
                ? " и е препратен към общината."
                : " и предстои да бъде препратен към общината."}
            </p>
            <p className="mt-3 text-slate-700">
              Код за проследяване:{" "}
              <span className="font-mono text-lg font-bold text-brand-700">
                {state.refCode}
              </span>
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Запазете този код. Можете да го споменете, ако се свържете с нас или
              с общината за статуса на сигнала.
            </p>
            <Link href="/" className="btn-primary mt-4">
              Към началото
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHero
        title="Сигнали до общината"
        intro="Подайте сигнал или оплакване за проблем в града. Препращаме го към съответната институция. Това не е канал за спешни случаи — при спешност звънете на 112."
        crumbs={[{ name: "Сигнали до общината", path: "/signali" }]}
      />
      <div className="container-content py-10">
        <form action={action} className="max-w-2xl space-y-4">
          {state.error && (
            <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {state.error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="category">
                Категория *
              </label>
              <select id="category" name="category" required className="input">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="location">
                Местоположение (улица, район)
              </label>
              <input id="location" name="location" className="input" />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="subject">
              Заглавие *
            </label>
            <input id="subject" name="subject" required maxLength={160} className="input" />
          </div>

          <div>
            <label className="label" htmlFor="message">
              Описание на проблема *
            </label>
            <textarea
              id="message"
              name="message"
              required
              rows={6}
              maxLength={5000}
              className="input"
              placeholder="Опишете къде, какво и от кога е проблемът."
            />
          </div>

          <fieldset className="rounded-lg border border-slate-200 p-4">
            <legend className="px-1 text-sm font-medium text-slate-700">
              Данни за връзка (по избор, но помагат за обратна връзка)
            </legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="name">
                  Име
                </label>
                <input id="name" name="name" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="phone">
                  Телефон
                </label>
                <input id="phone" name="phone" inputMode="tel" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="email">
                  Имейл
                </label>
                <input id="email" name="email" inputMode="email" className="input" />
              </div>
            </div>
          </fieldset>

          {/* Honeypot против ботове */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden
          />

          <p className="text-xs text-slate-600">
            С подаването приемате сигналът и посочените данни за връзка да бъдат
            предадени към съответната институция. Вижте{" "}
            <Link href="/poveritelnost" className="underline">
              Политиката за поверителност
            </Link>
            .
          </p>

          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Изпращане…" : "Изпрати сигнала"}
          </button>
        </form>
      </div>
    </>
  );
}
