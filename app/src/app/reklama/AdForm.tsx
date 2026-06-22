"use client";

import { useActionState } from "react";
import { submitAdRequest } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { Honeypot, SubmitButton, FormResult } from "@/components/FormParts";

export function AdForm() {
  const [state, action] = useActionState(submitAdRequest, EMPTY_FORM_STATE);
  return (
    <form action={action} className="max-w-2xl space-y-4">
      <Honeypot />
      <div>
        <label className="label" htmlFor="fullName">
          Име / фирма *
        </label>
        <input id="fullName" name="fullName" required className="input" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
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
      <div>
        <label className="label" htmlFor="message">
          Какво искате да рекламирате?
        </label>
        <textarea id="message" name="message" rows={4} className="input" />
      </div>
      <SubmitButton label="Изпрати заявка" />
      <FormResult state={state} />
    </form>
  );
}
