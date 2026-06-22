"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { SubmitButton, FormResult } from "@/components/FormParts";

export function LoginForm() {
  const [state, action] = useActionState(login, EMPTY_FORM_STATE);
  return (
    <form action={action} className="max-w-sm space-y-4">
      <div>
        <label className="label" htmlFor="email">
          Имейл
        </label>
        <input id="email" name="email" type="email" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Парола
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="input"
        />
      </div>
      <SubmitButton label="Вход" />
      <FormResult state={state} />
    </form>
  );
}
