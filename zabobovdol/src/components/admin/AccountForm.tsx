"use client";

import { useActionState } from "react";
import { updateOwnAccount } from "@/lib/admin/account-actions";
import type { FormState } from "@/lib/form-state";

const initial: FormState = { ok: false };

// Формата „Моят профил“. Паролите никога не се връщат в полетата.
export function AccountForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(updateOwnAccount, initial);
  const err = state.fieldErrors ?? {};
  const emailValue = state.values?.email ?? email;

  const pw = (name: string, label: string, help: string, autoComplete: string) => (
    <div>
      <label className="label" htmlFor={`acc-${name}`}>
        {label}
      </label>
      <input
        id={`acc-${name}`}
        name={name}
        type="password"
        className="input"
        autoComplete={autoComplete}
        aria-invalid={err[name] ? true : undefined}
        aria-describedby={`acc-${name}-msg`}
      />
      <p id={`acc-${name}-msg`} className={err[name] ? "field-error" : "mt-1 text-xs text-slate-600"}>
        {err[name] ?? help}
      </p>
    </div>
  );

  return (
    <form key={state.attempt ?? 0} action={action} noValidate className="space-y-6">
      {state.error && (
        <p role="alert" className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {state.error}
        </p>
      )}

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Имейл за вход</h2>
        <div>
          <label className="label" htmlFor="acc-email">
            Имейл
          </label>
          <input
            id="acc-email"
            name="email"
            type="email"
            className="input"
            defaultValue={emailValue}
            autoComplete="username"
            spellCheck={false}
            aria-invalid={err.email ? true : undefined}
            aria-describedby="acc-email-msg"
          />
          <p id="acc-email-msg" className={err.email ? "field-error" : "mt-1 text-xs text-slate-600"}>
            {err.email ?? "С него влизате в панела."}
          </p>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Нова парола</h2>
          <p className="mt-1 text-sm text-slate-600">
            Оставете празно, ако не я сменяте. След смяната всички други влизания (на други
            устройства) се прекратяват.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {pw("newPassword", "Нова парола", "Поне 10 знака.", "new-password")}
          {pw("newPassword2", "Повторете новата парола", "Същата, за проверка.", "new-password")}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-6">
        {pw("currentPassword", "Сегашната ви парола", "За потвърждение на всяка промяна.", "current-password")}
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Записване…" : "Запази промените"}
        </button>
      </section>
    </form>
  );
}
