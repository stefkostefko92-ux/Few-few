"use client";

import { useActionState } from "react";
import { submitDump } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { Honeypot, SubmitButton, FormResult } from "@/components/FormParts";

export function DumpForm() {
  const [state, action] = useActionState(submitDump, EMPTY_FORM_STATE);

  return (
    <form action={action} className="max-w-2xl space-y-4">
      <Honeypot />

      <div>
        <label className="label" htmlFor="location">
          Къде е сметището? *
        </label>
        <input
          id="location"
          name="location"
          required
          className="input"
          placeholder="улица, квартал или ориентир"
        />
      </div>

      <div>
        <label className="label" htmlFor="description">
          Описание
        </label>
        <textarea id="description" name="description" rows={4} className="input" />
      </div>

      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm text-slate-500">
          За връзка (по желание)
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="reporterName">
              Име
            </label>
            <input id="reporterName" name="reporterName" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="reporterPhone">
              Телефон
            </label>
            <input id="reporterPhone" name="reporterPhone" className="input" />
          </div>
        </div>
      </fieldset>

      <SubmitButton label="Изпрати сигнала" />
      <FormResult state={state} />
    </form>
  );
}
