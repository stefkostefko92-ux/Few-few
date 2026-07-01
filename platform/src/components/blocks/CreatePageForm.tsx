"use client";

import { useActionState } from "react";
import type { PageActionResult } from "@/app/dashboard/sites/[slug]/pages/actions";

const initial: PageActionResult = {};

export function CreatePageForm({
  action,
}: {
  action: (prev: PageActionResult, form: FormData) => Promise<PageActionResult>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <input name="title" required placeholder="Заглавие на страницата" className="input" />
      <input name="slug" placeholder="адрес (напр. za-nas) — празно за начална" className="input" />
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "…" : "Създай"}
      </button>
      {(state.error || state.ok) && (
        <p className={`sm:col-span-3 text-xs ${state.error ? "text-red-400" : "text-green-400"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
