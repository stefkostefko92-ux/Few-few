"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "@/components/icons";
import { PrivacyNotice } from "@/components/FormParts";
import { submitContact, type ContactState } from "./actions";

const initial: ContactState = { ok: false };

export function ContactForm() {
  const [state, action, pending] = useActionState(submitContact, initial);

  if (state.ok) {
    return (
      <div className="card bg-green-50">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-green-700" aria-hidden />
          <p className="text-lg font-semibold text-slate-800">Съобщението е изпратено.</p>
        </div>
        <p className="mt-2 text-slate-700">
          Благодарим! Ще се свържем с вас при нужда. Отговаряме в рамките на
          няколко работни дни.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-4">
      <h2 className="text-lg font-bold text-slate-900">Изпратете ни съобщение</h2>
      {state.error && (
        <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Вашето име (по избор)</label>
          <input id="name" name="name" maxLength={120} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Телефон (по избор)</label>
          <input id="phone" name="phone" maxLength={40} inputMode="tel" className="input" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="email">Имейл (по избор, ако искате отговор)</label>
        <input id="email" name="email" maxLength={160} inputMode="email" className="input" />
      </div>

      <div>
        <label className="label" htmlFor="subject">Тема (по избор)</label>
        <input
          id="subject"
          name="subject"
          maxLength={160}
          className="input"
          placeholder="напр. „Искам да добавите моя услуга“"
        />
      </div>

      <div>
        <label className="label" htmlFor="message">Съобщение *</label>
        <textarea
          id="message"
          name="message"
          required
          rows={6}
          maxLength={5000}
          className="input"
          placeholder="Напишете въпроса, предложението или какво искате да добавим."
        />
      </div>

      {/* Honeypot против ботове */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />

      <PrivacyNotice />
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Изпращане…" : "Изпрати съобщението"}
      </button>
    </form>
  );
}
