"use client";

import { useActionState } from "react";
import { submitMemory } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { Honeypot, SubmitButton, FormResult } from "@/components/FormParts";

export function MemoryForm() {
  const [state, action] = useActionState(submitMemory, EMPTY_FORM_STATE);
  return (
    <form action={action} className="max-w-2xl space-y-4">
      <Honeypot />
      <div>
        <label className="label" htmlFor="title">
          Заглавие *
        </label>
        <input id="title" name="title" required className="input" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="author">
            Автор / разказвач
          </label>
          <input id="author" name="author" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="period">
            Период
          </label>
          <input id="period" name="period" className="input" placeholder="напр. 1980-те" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="content">
          Спомен *
        </label>
        <textarea id="content" name="content" required rows={6} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="imageUrl">
          Линк към снимка (по желание)
        </label>
        <input id="imageUrl" name="imageUrl" className="input" placeholder="https://…" />
      </div>
      <SubmitButton label="Сподели спомена" />
      <FormResult state={state} />
    </form>
  );
}
