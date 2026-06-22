"use client";

import { useActionState } from "react";
import { createPost } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { SubmitButton, FormResult } from "@/components/FormParts";

export function PostForm() {
  const [state, action] = useActionState(createPost, EMPTY_FORM_STATE);
  return (
    <form action={action} className="max-w-2xl space-y-4">
      <div>
        <label className="label" htmlFor="title">
          Заглавие *
        </label>
        <input id="title" name="title" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="excerpt">
          Кратко резюме
        </label>
        <input id="excerpt" name="excerpt" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="content">
          Текст
        </label>
        <textarea id="content" name="content" rows={5} className="input" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="source">
            Източник (име)
          </label>
          <input id="source" name="source" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="sourceUrl">
            Източник (линк)
          </label>
          <input id="sourceUrl" name="sourceUrl" className="input" />
        </div>
      </div>
      <SubmitButton label="Добави новина" />
      <FormResult state={state} />
    </form>
  );
}
