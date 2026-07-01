"use client";

import { useActionState } from "react";
import type { FormResult } from "@/lib/admin/actions";

const initial: FormResult = {};

type Values = {
  name?: string;
  slug?: string;
  url?: string;
  apiBaseUrl?: string | null;
  deployHookUrl?: string | null;
  notes?: string | null;
  hasKey?: boolean;
};

export function SiteForm({
  action,
  values = {},
  submitLabel,
}: {
  action: (prev: FormResult, form: FormData) => Promise<FormResult>;
  values?: Values;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Име
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={values.name}
            className="input"
            placeholder="За Бобов дол"
          />
        </div>
        <div>
          <label className="label" htmlFor="slug">
            Идентификатор (slug)
          </label>
          <input
            id="slug"
            name="slug"
            required
            defaultValue={values.slug}
            className="input"
            placeholder="zabobovdol"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="url">
          Публичен адрес (за мониторинг)
        </label>
        <input
          id="url"
          name="url"
          type="url"
          required
          defaultValue={values.url}
          className="input"
          placeholder="https://zabobovdol.carbonstealth.eu"
        />
      </div>

      <div>
        <label className="label" htmlFor="apiBaseUrl">
          API адрес (за съдържание/деплой) — по избор
        </label>
        <input
          id="apiBaseUrl"
          name="apiBaseUrl"
          type="url"
          defaultValue={values.apiBaseUrl ?? ""}
          className="input"
          placeholder="https://zabobovdol.carbonstealth.eu"
        />
      </div>

      <div>
        <label className="label" htmlFor="apiKey">
          API ключ на сайта {values.hasKey && "(зададен — оставете празно, за да не се сменя)"}
        </label>
        <input
          id="apiKey"
          name="apiKey"
          type="password"
          autoComplete="new-password"
          className="input"
          placeholder={values.hasKey ? "••••••••" : "таен ключ"}
        />
        <p className="mt-1 text-xs text-ink-500">
          Съхранява се криптиран (AES-256-GCM). Праща се към сайта като Bearer
          при синхронизация и деплой.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="deployHookUrl">
          Адрес за деплой (webhook) — по избор
        </label>
        <input
          id="deployHookUrl"
          name="deployHookUrl"
          type="url"
          defaultValue={values.deployHookUrl ?? ""}
          className="input"
          placeholder="https://…/api/platform/deploy"
        />
      </div>

      <div>
        <label className="label" htmlFor="notes">
          Бележки — по избор
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={values.notes ?? ""}
          className="input"
        />
      </div>

      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-400">{state.ok}</p>}

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Запазване…" : submitLabel}
      </button>
    </form>
  );
}
