"use client";

import { useActionState } from "react";
import { submitContactAction, type SubmitState } from "@/app/site/submit-action";

const initial: SubmitState = {};

// Двуезични надписи на самата форма (съдържанието идва отвън; тук е „обвивката").
const T = {
  bg: {
    name: "Име",
    email: "Имейл",
    message: "Съобщение",
    sending: "Изпращане…",
    preview: "(Превю — формата работи на публикувания сайт.)",
    notice:
      "С изпращането предоставяте името и имейла си, за да можем да отговорим на запитването ви. Обработваме данните само за тази цел (законен интерес, чл. 6, § 1, б. „е“ GDPR), не ги предаваме на трети страни за маркетинг и ги пазим ограничен период. Имате право на достъп, коригиране и изтриване.",
  },
  en: {
    name: "Name",
    email: "Email",
    message: "Message",
    sending: "Sending…",
    preview: "(Preview — the form works on the published site.)",
    notice:
      "By submitting, you provide your name and email so we can reply to your enquiry. We process the data only for this purpose (legitimate interest, Art. 6(1)(f) GDPR), do not share it with third parties for marketing, and keep it for a limited period. You have the right of access, rectification and erasure.",
  },
} as const;

// Контактна форма на публичен сайт → събира заявки в платформата.
// Без siteSlug (в конструктора/преглед) е само визуален, неактивен превю.
export function SiteContactForm({
  siteSlug,
  title,
  buttonLabel,
  successMessage,
  locale = "bg",
}: {
  siteSlug?: string;
  title: string;
  buttonLabel: string;
  successMessage: string;
  locale?: "bg" | "en";
}) {
  const [state, formAction, pending] = useActionState(submitContactAction, initial);
  const disabled = !siteSlug;
  const t = T[locale];

  return (
    <div className="mx-auto w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h3 className="pub-display text-2xl font-semibold text-slate-900">{title}</h3>
      {state.ok ? (
        <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </p>
      ) : (
        <form action={formAction} className="mt-4 space-y-3">
          <input type="hidden" name="site" value={siteSlug ?? ""} />
          {/* honeypot — скрит от хора, ловим ботове */}
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{t.name}</span>
              <input name="name" required disabled={disabled} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{t.email}</span>
              <input name="email" type="email" required disabled={disabled} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{t.message}</span>
            <textarea name="message" rows={4} required disabled={disabled} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400" />
          </label>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <button
            type="submit"
            disabled={disabled || pending}
            style={{ backgroundColor: "var(--pub-accent, #4f46e5)", color: "var(--pub-accent-text, #fff)" }}
            className="pub-btn inline-flex justify-center rounded-xl px-6 py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {pending ? t.sending : buttonLabel}
          </button>
          {/* Прозрачност по GDPR (чл. 13): цел, основание, съхранение. */}
          <p className="text-xs leading-relaxed text-slate-500">{t.notice}</p>
          {disabled && <p className="text-xs text-slate-400">{t.preview}</p>}
        </form>
      )}
    </div>
  );
}
