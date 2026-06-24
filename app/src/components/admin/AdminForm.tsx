"use client";

import Link from "next/link";
import { useState } from "react";
import type { Field } from "@/lib/admin/resources";

type Props = {
  fields: Field[];
  initial: Record<string, string | boolean>;
  action: (formData: FormData) => void | Promise<void>;
  cancelHref: string;
  title: string;
};

export function AdminForm({ fields, initial, action, cancelHref, title }: Props) {
  const [pending, setPending] = useState(false);

  return (
    <form
      action={async (fd) => {
        setPending(true);
        await action(fd);
        // При успех server action прави redirect; ако се върнем — спираме индикатора.
        setPending(false);
      }}
      className="space-y-5"
    >
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <div className="flex gap-2">
          <Link href={cancelHref} className="btn-secondary">
            Отказ
          </Link>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Запазване…" : "Запази"}
          </button>
        </div>
      </div>

      <div className="grid gap-5 rounded-xl border border-slate-200 bg-white p-6 md:grid-cols-2">
        {fields.map((f) => (
          <div
            key={f.name}
            className={f.fullWidth || f.type === "boolean" ? "md:col-span-2" : ""}
          >
            <FieldInput field={f} value={initial[f.name]} />
            {f.help && <p className="mt-1 text-xs text-slate-500">{f.help}</p>}
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Link href={cancelHref} className="btn-secondary">
          Отказ
        </Link>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Запазване…" : "Запази"}
        </button>
      </div>
    </form>
  );
}

function FieldInput({
  field,
  value,
}: {
  field: Field;
  value: string | boolean | undefined;
}) {
  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          name={field.name}
          defaultChecked={Boolean(value)}
          className="h-5 w-5 rounded border-slate-300"
        />
        <span className="font-medium text-slate-800">{field.label}</span>
      </label>
    );
  }

  const v = typeof value === "string" ? value : "";

  return (
    <>
      <label className="label" htmlFor={field.name}>
        {field.label}
        {field.required && <span className="text-red-600"> *</span>}
      </label>
      {field.type === "textarea" || field.type === "markdown" ? (
        <textarea
          id={field.name}
          name={field.name}
          defaultValue={v}
          required={field.required}
          rows={field.type === "markdown" ? 10 : 3}
          className={"input " + (field.type === "markdown" ? "font-mono text-sm" : "")}
        />
      ) : field.type === "select" ? (
        <select id={field.name} name={field.name} defaultValue={v} className="input">
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === "datetime" ? (
        <input
          id={field.name}
          name={field.name}
          type="datetime-local"
          defaultValue={v}
          required={field.required}
          className="input"
        />
      ) : field.type === "number" ? (
        <input
          id={field.name}
          name={field.name}
          type="number"
          step="any"
          defaultValue={v}
          className="input"
        />
      ) : (
        <input
          id={field.name}
          name={field.name}
          type="text"
          defaultValue={v}
          required={field.required}
          className="input"
        />
      )}
    </>
  );
}
