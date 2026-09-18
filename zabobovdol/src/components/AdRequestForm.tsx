"use client";

import { useActionState } from "react";
import { submitAdRequest, type AdRequestState } from "@/app/reklama/actions";
import { PrivacyNote } from "@/components/PrivacyNote";

const initial: AdRequestState = { ok: false };

export function AdRequestForm({
  paymentUrl,
  price,
}: {
  paymentUrl: string;
  price: number;
}) {
  const [state, action, pending] = useActionState(submitAdRequest, initial);

  if (state.ok) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-5">
        <p className="text-slate-800">
          Благодарим! Получихме заявката Ви. <strong>Първо ще се свържем с Вас</strong>,
          за да уточним текста, изображението и линка на рекламата.
        </p>
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>Важно:</strong> платете таксата от {price}€ на месец{" "}
          <strong>едва след като се свържем и се уговорим</strong>.
        </p>
        <a
          href={paymentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary mt-4"
        >
          Платете {price}€ с Revolut (след уговорка)
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      <div>
        <label className="label" htmlFor="fullName">
          Три имена *
        </label>
        <input
          id="fullName"
          name="fullName"
          required
          className="input"
          placeholder="Име Презиме Фамилия"
          autoComplete="name"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="email">
            Имейл
          </label>
          <input id="email" name="email" inputMode="email" className="input" autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            Телефон
          </label>
          <input id="phone" name="phone" inputMode="tel" className="input" autoComplete="tel" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="message">
          Съобщение (по избор)
        </label>
        <textarea
          id="message"
          name="message"
          rows={3}
          className="input"
          placeholder="Каква реклама желаете? (бизнес, услуга, линк)"
        />
      </div>

      {/* Honeypot против ботове */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      <p className="text-xs text-slate-600">
        Посочете поне имейл или телефон. Ще се свържем с Вас, за да подготвим
        банера.
      </p>
      <PrivacyNote />

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Изпращане…" : "Изпратете заявка"}
      </button>
    </form>
  );
}
