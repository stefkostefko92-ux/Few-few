"use client";

import { useActionState } from "react";
import { submitRideshare } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { Honeypot, SubmitButton, FormResult } from "@/components/FormParts";

export function RideForm() {
  const [state, action] = useActionState(submitRideshare, EMPTY_FORM_STATE);
  return (
    <form action={action} className="max-w-2xl space-y-4">
      <Honeypot />
      <div>
        <label className="label" htmlFor="kind">
          Какво е това?
        </label>
        <select id="kind" name="kind" className="input">
          <option value="OFFER">Предлагам място в колата</option>
          <option value="NEED">Търся превоз</option>
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="routeFrom">
            Откъде *
          </label>
          <input id="routeFrom" name="routeFrom" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="routeTo">
            Докъде *
          </label>
          <input id="routeTo" name="routeTo" required className="input" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <input name="schedule" className="input" placeholder="Кога (дни/час)" />
        <input name="seats" className="input" placeholder="Свободни места" />
        <input name="costNote" className="input" placeholder="Дял от разходите" />
      </div>
      <div>
        <label className="label" htmlFor="description">
          Допълнително
        </label>
        <textarea id="description" name="description" rows={3} className="input" />
      </div>
      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm text-slate-500">За връзка</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <input name="contactName" className="input" placeholder="Име" />
          <input name="contactPhone" className="input" placeholder="Телефон" />
          <input name="contactEmail" type="email" className="input" placeholder="Имейл" />
        </div>
      </fieldset>
      <SubmitButton label="Публикувай обявата" />
      <FormResult state={state} />
    </form>
  );
}
