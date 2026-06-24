"use client";

import { useActionState } from "react";
import { sendContact, type ContactState } from "./actions";
import { Send, CheckCircle2 } from "@/components/icons";

const initial: ContactState = {};

export function ContactForm() {
  const [state, action, pending] = useActionState(sendContact, initial);

  if (state.ok) {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-5 text-green-800"
      >
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">Благодарим! Съобщението е изпратено.</p>
          <p className="text-sm">Ще се свържем с вас при нужда.</p>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* Honeypot — скрито за хората, примамка за ботове. */}
      <div className="hidden" aria-hidden>
        <label>
          Не попълвайте това поле
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Име <span className="text-red-600">*</span>
          </label>
          <input id="name" name="name" type="text" required autoComplete="name" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Имейл <span className="text-red-600">*</span>
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="subject">
          Тема
        </label>
        <input id="subject" name="subject" type="text" className="input" />
      </div>

      <div>
        <label className="label" htmlFor="body">
          Съобщение <span className="text-red-600">*</span>
        </label>
        <textarea id="body" name="body" required rows={6} className="input" />
      </div>

      <p className="text-xs text-slate-500">
        С изпращането се съгласявате данните ви да бъдат обработени за отговор на
        запитването, съгласно{" "}
        <a href="/poveritelnost" className="underline">
          Политиката за поверителност
        </a>
        .
      </p>

      <button type="submit" className="btn-primary" disabled={pending}>
        <Send className="h-4 w-4" aria-hidden />
        {pending ? "Изпращане…" : "Изпрати съобщение"}
      </button>
    </form>
  );
}
