"use client";

import { useActionState } from "react";
import { submitListing } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { Honeypot, SubmitButton, FormResult } from "@/components/FormParts";

const TYPES: { value: string; label: string }[] = [
  { value: "OFFER", label: "Предлага се / продава се" },
  { value: "WANTED", label: "Търси се / купува се" },
  { value: "JOB", label: "Работа" },
  { value: "REALESTATE", label: "Имоти" },
  { value: "FREE", label: "Подарява се" },
  { value: "OTHER", label: "Друго" },
];

export function ListingForm() {
  const [state, action] = useActionState(submitListing, EMPTY_FORM_STATE);

  return (
    <form action={action} className="max-w-2xl space-y-4">
      <Honeypot />

      <div>
        <label className="label" htmlFor="title">
          Заглавие *
        </label>
        <input id="title" name="title" required className="input" />
      </div>

      <div>
        <label className="label" htmlFor="type">
          Вид обява
        </label>
        <select id="type" name="type" className="input">
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="description">
          Описание *
        </label>
        <textarea id="description" name="description" required rows={5} className="input" />
      </div>

      <div>
        <label className="label" htmlFor="price">
          Цена (по желание)
        </label>
        <input id="price" name="price" className="input" placeholder="напр. 50 лв или „по договаряне“" />
      </div>

      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm text-slate-500">За връзка</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="contactName">
              Име
            </label>
            <input id="contactName" name="contactName" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="contactPhone">
              Телефон
            </label>
            <input id="contactPhone" name="contactPhone" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="contactEmail">
              Имейл
            </label>
            <input id="contactEmail" name="contactEmail" type="email" className="input" />
          </div>
        </div>
      </fieldset>

      <SubmitButton label="Подай обявата" />
      <FormResult state={state} />
    </form>
  );
}
