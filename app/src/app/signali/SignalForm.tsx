"use client";

import { useActionState } from "react";
import { submitComplaint } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { Honeypot, SubmitButton, FormResult } from "@/components/FormParts";

const CATEGORIES = [
  "Общи",
  "Пътища и тротоари",
  "Осветление",
  "Чистота и отпадъци",
  "Водоснабдяване",
  "Паркиране",
  "Зелени площи",
  "Друго",
];

export function SignalForm() {
  const [state, action] = useActionState(submitComplaint, EMPTY_FORM_STATE);

  return (
    <form action={action} className="max-w-2xl space-y-4">
      <Honeypot />

      <div>
        <label className="label" htmlFor="subject">
          Заглавие на сигнала *
        </label>
        <input id="subject" name="subject" required className="input" />
      </div>

      <div>
        <label className="label" htmlFor="category">
          Категория
        </label>
        <select id="category" name="category" className="input">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="location">
          Място (улица, квартал, ориентир)
        </label>
        <input id="location" name="location" className="input" />
      </div>

      <div>
        <label className="label" htmlFor="message">
          Описание *
        </label>
        <textarea id="message" name="message" required rows={5} className="input" />
      </div>

      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm text-slate-500">
          За връзка (по желание)
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
            <input id="phone" name="phone" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="email">
              Имейл
            </label>
            <input id="email" name="email" type="email" className="input" />
          </div>
        </div>
      </fieldset>

      <SubmitButton label="Изпрати сигнала" />
      <FormResult state={state} />
    </form>
  );
}
