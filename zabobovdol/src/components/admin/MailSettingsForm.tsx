"use client";

import { useActionState } from "react";
import { saveMailSettings } from "@/lib/admin/mail-actions";
import type { FormState } from "@/lib/form-state";
import { SMTP_PORTS } from "@/lib/mail-ports";

type Values = { host: string; port: string; user: string; fromName: string; fromEmail: string };

const initial: FormState = { ok: false };

// Формата за пощата (Brevo SMTP). Ключът и паролата никога не се връщат в
// полетата — нито написаните, нито записаните.
export function MailSettingsForm({ defaults, keySaved }: { defaults: Values; keySaved: boolean }) {
  const [state, action, pending] = useActionState(saveMailSettings, initial);
  const v: Values = { ...defaults, ...(state.values as Partial<Values> | undefined) };
  const err = state.fieldErrors ?? {};

  const field = (
    name: keyof Values,
    label: string,
    help?: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div>
      <label className="label" htmlFor={`mail-${name}`}>
        {label}
      </label>
      <input
        id={`mail-${name}`}
        name={name}
        className="input"
        defaultValue={v[name]}
        aria-invalid={err[name] ? true : undefined}
        aria-describedby={err[name] ? `mail-${name}-err` : help ? `mail-${name}-help` : undefined}
        {...props}
      />
      {err[name] ? (
        <p id={`mail-${name}-err`} className="field-error">
          {err[name]}
        </p>
      ) : (
        help && (
          <p id={`mail-${name}-help`} className="mt-1 text-xs text-slate-600">
            {help}
          </p>
        )
      )}
    </div>
  );

  return (
    <form key={state.attempt ?? 0} action={action} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6" noValidate>
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Настройки на Brevo (SMTP)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Стойностите са в Brevo → <strong>SMTP &amp; API</strong> → раздел <strong>SMTP</strong>.
        </p>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {field("host", "Сървър (SMTP Server)", "При Brevo: smtp-relay.brevo.com", {
          autoComplete: "off",
          spellCheck: false,
        })}
        <div>
          <label className="label" htmlFor="mail-port">
            Порт
          </label>
          <select
            id="mail-port"
            name="port"
            className="input"
            defaultValue={v.port}
            aria-invalid={err.port ? true : undefined}
            aria-describedby={err.port ? "mail-port-err" : "mail-port-help"}
          >
            {SMTP_PORTS.map((p) => (
              <option key={p} value={String(p)}>
                {p}
                {p === 587 ? " (препоръчан)" : p === 2525 ? " (ако 587 е спрян)" : " (TLS)"}
              </option>
            ))}
          </select>
          {err.port ? (
            <p id="mail-port-err" className="field-error">
              {err.port}
            </p>
          ) : (
            <p id="mail-port-help" className="mt-1 text-xs text-slate-600">
              587 върши работа почти навсякъде; 2525 — ако хостингът спира 587.
            </p>
          )}
        </div>
        {field("user", "Логин (Login)", "Обикновено завършва на @smtp-brevo.com", {
          autoComplete: "off",
          spellCheck: false,
        })}
        <div>
          <label className="label" htmlFor="mail-key">
            SMTP ключ {keySaved && <span className="text-slate-600">(записан — не се показва)</span>}
          </label>
          <input
            id="mail-key"
            name="key"
            type="password"
            className="input"
            autoComplete="new-password"
            placeholder={keySaved ? "Оставете празно, за да остане записаният" : "Поставете ключа от Brevo"}
            aria-invalid={err.key ? true : undefined}
            aria-describedby={err.key ? "mail-key-err" : "mail-key-help"}
          />
          {err.key ? (
            <p id="mail-key-err" className="field-error">
              {err.key}
            </p>
          ) : (
            <p id="mail-key-help" className="mt-1 text-xs text-slate-600">
              „Generate a new SMTP key“ в Brevo. Пази се шифрован.
            </p>
          )}
        </div>
        {field("fromName", "Име на подателя", "Например: За Бобов дол", { maxLength: 80 })}
        {field(
          "fromEmail",
          "Адрес на подателя",
          "Трябва да е потвърден в Brevo (Senders, Domains & Dedicated IPs).",
          { type: "email", autoComplete: "off", spellCheck: false },
        )}
      </div>

      <div className="rounded-lg bg-slate-50 p-4">
        <label className="label" htmlFor="mail-accountPassword">
          Вашата парола за панела
        </label>
        <input
          id="mail-accountPassword"
          name="accountPassword"
          type="password"
          className="input"
          autoComplete="current-password"
          aria-invalid={err.accountPassword ? true : undefined}
          aria-describedby={err.accountPassword ? "mail-accountPassword-err" : "mail-accountPassword-help"}
        />
        {err.accountPassword ? (
          <p id="mail-accountPassword-err" className="field-error">
            {err.accountPassword}
          </p>
        ) : (
          <p id="mail-accountPassword-help" className="mt-1 text-xs text-slate-600">
            За потвърждение — оттук тръгват всички писма на сайта.
          </p>
        )}
      </div>

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Записване…" : "Запази и включи"}
      </button>
    </form>
  );
}
