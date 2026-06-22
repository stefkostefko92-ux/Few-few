"use client";

import { useActionState } from "react";
import { createScam } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { SubmitButton, FormResult } from "@/components/FormParts";

export function ScamForm() {
  const [state, action] = useActionState(createScam, EMPTY_FORM_STATE);
  return (
    <form action={action} className="max-w-2xl space-y-4">
      <div>
        <label className="label" htmlFor="title">
          Заглавие *
        </label>
        <input id="title" name="title" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="summary">
          Кратко описание (за лентата)
        </label>
        <input id="summary" name="summary" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="body">
          Подробности
        </label>
        <textarea id="body" name="body" rows={4} className="input" />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <label className="label" htmlFor="severity">
            Ниво
          </label>
          <select id="severity" name="severity" className="input">
            <option value="info">Информация</option>
            <option value="warning">Внимание</option>
            <option value="danger">Опасност</option>
          </select>
        </div>
        <label className="flex items-center gap-2 pt-6 text-base text-slate-700">
          <input type="checkbox" name="pinned" /> Закачи на началната страница
        </label>
      </div>
      <SubmitButton label="Добави предупреждение" />
      <FormResult state={state} />
    </form>
  );
}
