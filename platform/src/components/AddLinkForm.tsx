"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/app/dashboard/sites/[slug]/actions";

const initial: ActionResult = {};

// Форма за добавяне на връзка към хъба на сайта.
export function AddLinkForm({
  action,
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <input name="label" required placeholder="Етикет" className="input" />
      <input
        name="url"
        type="url"
        required
        placeholder="https://…"
        className="input"
      />
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "…" : "Добави"}
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
