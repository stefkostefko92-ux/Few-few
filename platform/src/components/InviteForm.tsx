"use client";

import { useActionState } from "react";
import type { MemberState } from "@/app/dashboard/sites/[slug]/members/actions";

const initial: MemberState = {};

export function InviteForm({
  action,
}: {
  action: (prev: MemberState, formData: FormData) => Promise<MemberState>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="block flex-1">
        <span className="label">Имейл</span>
        <input name="email" type="email" required className="input" placeholder="colleague@example.com" />
      </label>
      <label className="block">
        <span className="label">Роля</span>
        <select name="role" className="input" defaultValue="VIEWER">
          <option value="VIEWER">Наблюдател</option>
          <option value="MANAGER">Мениджър</option>
        </select>
      </label>
      <button className="btn-primary px-4 py-2 text-sm" disabled={pending}>
        {pending ? "…" : "Покани"}
      </button>
      {state.ok && <span className="w-full text-sm text-green-400">{state.ok}</span>}
      {state.error && <span className="w-full text-sm text-red-400">{state.error}</span>}
    </form>
  );
}
