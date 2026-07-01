"use client";

import { useActionState } from "react";
import { changePasswordAction, type ProfileState } from "@/app/dashboard/profile/actions";

const initial: ProfileState = {};

export function ProfileForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="current">Текуща парола</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="next">Нова парола (мин. 10 знака)</label>
        <input id="next" name="next" type="password" autoComplete="new-password" required minLength={10} className="input" />
      </div>
      {state.error && <p className="text-sm text-red-400" role="alert">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-400">{state.ok}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Запазване…" : "Смени паролата"}
      </button>
    </form>
  );
}
