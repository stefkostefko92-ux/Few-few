"use client";

import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/forms";

// Скрито honeypot поле — скрито за хора, примамка за ботове.
export function Honeypot() {
  return (
    <div className="hidden" aria-hidden>
      <label>
        Не попълвайте това поле
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

// Кратко уведомление по чл. 13 GDPR на мястото на събиране на данните.
// Слага се над бутона за изпращане във всяка форма, която събира лични данни.
export function PrivacyNotice() {
  return (
    <p className="mt-4 text-sm text-gray-600">
      С изпращането приемате обработката на въведените данни съгласно{" "}
      <a href="/poveritelnost" className="underline">
        Политиката за поверителност
      </a>
      .
    </p>
  );
}

export function SubmitButton({ label = "Изпрати" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Изпращане…" : label}
    </button>
  );
}

// Показва резултата (успех/грешка) след изпращане.
export function FormResult({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <div
      role="status"
      className={
        "mt-4 rounded-lg border p-4 text-base " +
        (state.ok
          ? "border-green-300 bg-green-50 text-green-800"
          : "border-red-300 bg-red-50 text-red-800")
      }
    >
      <p>{state.message}</p>
      {state.refCode && (
        <p className="mt-1">
          Вашият номер за проследяване:{" "}
          <strong className="font-mono">{state.refCode}</strong>. Запишете го.
        </p>
      )}
    </div>
  );
}
