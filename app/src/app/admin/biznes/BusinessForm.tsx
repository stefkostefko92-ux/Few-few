"use client";

import { useActionState } from "react";
import { createBusiness } from "./actions";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { SubmitButton, FormResult } from "@/components/FormParts";

const CATS = [
  { value: "SHOP", label: "Магазин" },
  { value: "FOOD", label: "Храна / заведение" },
  { value: "SERVICE", label: "Услуга" },
  { value: "CRAFT", label: "Занаят" },
  { value: "HEALTH", label: "Здраве / красота" },
  { value: "OTHER", label: "Друго" },
];

export function BusinessForm() {
  const [state, action] = useActionState(createBusiness, EMPTY_FORM_STATE);
  return (
    <form action={action} className="max-w-2xl space-y-4">
      <div>
        <label className="label" htmlFor="name">
          Име *
        </label>
        <input id="name" name="name" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="category">
          Категория
        </label>
        <select id="category" name="category" className="input">
          {CATS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="description">
          Описание
        </label>
        <textarea id="description" name="description" rows={3} className="input" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="address">
            Адрес
          </label>
          <input id="address" name="address" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            Телефон
          </label>
          <input id="phone" name="phone" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="website">
            Сайт
          </label>
          <input id="website" name="website" className="input" />
        </div>
      </div>
      <SubmitButton label="Добави бизнес" />
      <FormResult state={state} />
    </form>
  );
}
