"use client";

import { useActionState } from "react";
import type { PageActionResult } from "@/app/dashboard/sites/[slug]/pages/actions";

const initial: PageActionResult = {};

// „Опиши сайта, AI го построява" — като Wix Aria. Генерира страница от описание.
export function AiPageForm({
  action,
}: {
  action: (prev: PageActionResult, form: FormData) => Promise<PageActionResult>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="space-y-2">
      <textarea
        name="prompt"
        required
        rows={2}
        placeholder="Опишете страницата, напр.: начална страница за пекарна в Бобов дол с меню и контакти"
        className="input"
      />
      <div className="flex items-center gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "AI генерира…" : "✨ Създай с AI"}
        </button>
        <span className="text-xs text-ink-500">
          Без ключ работи с шаблон; със свързан AI ключ — по-богато.
        </span>
      </div>
      {state.error && <p className="text-xs text-red-400">{state.error}</p>}
    </form>
  );
}
