"use client";

import { useActionState } from "react";
import { createUserAction, type FormResult } from "@/lib/admin/actions";

const initial: FormResult = {};

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState(createUserAction, initial);

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="u-name">
            Име
          </label>
          <input id="u-name" name="name" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="u-email">
            Имейл
          </label>
          <input id="u-email" name="email" type="email" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="u-pass">
            Парола (мин. 10 знака)
          </label>
          <input
            id="u-pass"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="u-role">
            Роля
          </label>
          <select id="u-role" name="role" className="input" defaultValue="MEMBER">
            <option value="MEMBER">Член (само зададени сайтове)</option>
            <option value="OWNER">Собственик (пълен достъп)</option>
          </select>
        </div>
      </div>
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-400">{state.ok}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Създаване…" : "Създай акаунт"}
      </button>
    </form>
  );
}
