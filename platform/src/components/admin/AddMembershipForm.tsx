"use client";

import { useActionState } from "react";
import type { FormResult } from "@/lib/admin/actions";

const initial: FormResult = {};

type UserOption = { id: string; name: string; email: string };

export function AddMembershipForm({
  action,
  users,
}: {
  action: (prev: FormResult, form: FormData) => Promise<FormResult>;
  users: UserOption[];
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  if (users.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        Всички налични акаунти вече имат достъп до този сайт.
      </p>
    );
  }

  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
      <select name="userId" required className="input" defaultValue="">
        <option value="" disabled>
          Изберете акаунт…
        </option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} ({u.email})
          </option>
        ))}
      </select>
      <select name="role" className="input" defaultValue="VIEWER">
        <option value="VIEWER">Наблюдател</option>
        <option value="MANAGER">Мениджър</option>
      </select>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "…" : "Дай достъп"}
      </button>
      {(state.error || state.ok) && (
        <p
          className={`sm:col-span-3 text-xs ${state.error ? "text-red-400" : "text-green-400"}`}
        >
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
