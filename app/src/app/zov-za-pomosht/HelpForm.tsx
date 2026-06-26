"use client";

import { useActionState } from "react";
import { submitHelpCause } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { Honeypot, SubmitButton, FormResult, PrivacyNotice } from "@/components/FormParts";

export function HelpForm() {
  const [state, action] = useActionState(submitHelpCause, EMPTY_FORM_STATE);
  return (
    <form action={action} className="max-w-2xl space-y-4">
      <Honeypot />
      <div>
        <label className="label" htmlFor="kind">
          Какво е това?
        </label>
        <select id="kind" name="kind" className="input">
          <option value="NEED">Нужда от помощ</option>
          <option value="OFFER">Предлагам помощ / дарение</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="title">
          Заглавие *
        </label>
        <input id="title" name="title" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="description">
          Описание *
        </label>
        <textarea id="description" name="description" required rows={4} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="location">
          Район / място
        </label>
        <input id="location" name="location" className="input" />
      </div>
      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm text-slate-500">За връзка</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <input name="contactName" className="input" placeholder="Име" />
          <input name="contactPhone" className="input" placeholder="Телефон" />
          <input name="contactEmail" type="email" className="input" placeholder="Имейл" />
        </div>
      </fieldset>
      <PrivacyNotice />
      <SubmitButton label="Изпрати" />
      <FormResult state={state} />
    </form>
  );
}
