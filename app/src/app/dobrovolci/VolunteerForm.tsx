"use client";

import { useActionState } from "react";
import { submitVolunteer } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { Honeypot, SubmitButton, FormResult, PrivacyNotice } from "@/components/FormParts";

export function VolunteerForm() {
  const [state, action] = useActionState(submitVolunteer, EMPTY_FORM_STATE);
  return (
    <form action={action} className="max-w-2xl space-y-4">
      <Honeypot />
      <div>
        <label className="label" htmlFor="name">
          Име *
        </label>
        <input id="name" name="name" required className="input" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="area">
            Район
          </label>
          <input id="area" name="area" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="skills">
            С какво помагате
          </label>
          <input id="skills" name="skills" className="input" placeholder="напр. пазаруване, разходка, дребен ремонт" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="about">
          Няколко думи за вас
        </label>
        <textarea id="about" name="about" rows={3} className="input" />
      </div>
      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm text-slate-500">
          За връзка (не се показва публично)
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <input name="phone" className="input" placeholder="Телефон" />
          <input name="email" type="email" className="input" placeholder="Имейл" />
        </div>
      </fieldset>
      <PrivacyNotice />
      <SubmitButton label="Запиши ме като доброволец" />
      <FormResult state={state} />
    </form>
  );
}
