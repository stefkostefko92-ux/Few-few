"use client";

import { useActionState } from "react";
import { submitContact } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { Honeypot, SubmitButton, FormResult } from "@/components/FormParts";

export function ContactForm() {
  const [state, action] = useActionState(submitContact, EMPTY_FORM_STATE);

  return (
    <form action={action} className="max-w-2xl space-y-4">
      <Honeypot />

      <div>
        <label className="label" htmlFor="subject">
          Тема
        </label>
        <input id="subject" name="subject" className="input" />
      </div>

      <div>
        <label className="label" htmlFor="message">
          Съобщение *
        </label>
        <textarea id="message" name="message" required rows={5} className="input" />
      </div>

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

      <SubmitButton label="Изпрати съобщението" />
      <FormResult state={state} />
    </form>
  );
}
