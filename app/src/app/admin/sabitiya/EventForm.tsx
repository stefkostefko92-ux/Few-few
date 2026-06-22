"use client";

import { useActionState } from "react";
import { createEvent } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { SubmitButton, FormResult } from "@/components/FormParts";

export function EventForm() {
  const [state, action] = useActionState(createEvent, EMPTY_FORM_STATE);
  return (
    <form action={action} className="max-w-2xl space-y-4">
      <div>
        <label className="label" htmlFor="title">
          Заглавие *
        </label>
        <input id="title" name="title" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="startAt">
          Начало *
        </label>
        <input id="startAt" name="startAt" type="datetime-local" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="location">
          Място
        </label>
        <input id="location" name="location" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="description">
          Описание
        </label>
        <textarea id="description" name="description" rows={4} className="input" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="organizer">
            Организатор
          </label>
          <input id="organizer" name="organizer" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="url">
            Линк
          </label>
          <input id="url" name="url" className="input" />
        </div>
      </div>
      <SubmitButton label="Добави събитие" />
      <FormResult state={state} />
    </form>
  );
}
