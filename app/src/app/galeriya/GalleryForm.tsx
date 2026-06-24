"use client";

import { useActionState } from "react";
import { submitPhoto } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { Honeypot, SubmitButton, FormResult } from "@/components/FormParts";

export function GalleryForm() {
  const [state, action] = useActionState(submitPhoto, EMPTY_FORM_STATE);
  return (
    <form action={action} className="max-w-2xl space-y-4">
      <Honeypot />
      <div>
        <label className="label" htmlFor="imageUrl">
          Линк към снимка *
        </label>
        <input id="imageUrl" name="imageUrl" required className="input" placeholder="https://…" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="title">
            Описание / къде е
          </label>
          <input id="title" name="title" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="author">
            Автор (кредит)
          </label>
          <input id="author" name="author" className="input" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="submitterContact">
          За връзка (не се показва публично)
        </label>
        <input id="submitterContact" name="submitterContact" className="input" />
      </div>
      <SubmitButton label="Изпрати снимката" />
      <FormResult state={state} />
    </form>
  );
}
