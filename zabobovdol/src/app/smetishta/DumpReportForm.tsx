"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "@/components/icons";
import { submitDumpReport, type DumpState } from "./actions";

const initial: DumpState = { ok: false };

export function DumpReportForm() {
  const [state, action, pending] = useActionState(submitDumpReport, initial);

  if (state.ok) {
    return (
      <div className="card max-w-xl bg-green-50">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-green-700" aria-hidden />
          <p className="text-lg font-semibold text-slate-800">
            Благодарим! Сигналът е получен.
          </p>
        </div>
        <p className="mt-2 text-slate-700">
          Ще го прегледаме и след одобрение ще се появи в списъка по-долу, за да
          го видят и съседите и общината.
        </p>
        <Link href="/smetishta" className="btn-primary mt-4">
          Към сигналите
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="max-w-2xl space-y-4">
      {state.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div>
        <label className="label" htmlFor="location">
          Къде е сметището? *
        </label>
        <input
          id="location"
          name="location"
          required
          maxLength={160}
          className="input"
          placeholder="Улица, квартал или ориентир (напр. „край пътя за с. Дяково“)"
        />
      </div>

      <div>
        <label className="label" htmlFor="description">
          Описание *
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={5}
          maxLength={3000}
          className="input"
          placeholder="Какви отпадъци, колко голямо е, от кога е там, има ли опасност."
        />
      </div>

      <div>
        <label className="label" htmlFor="photoUrl">
          Линк към снимка (по избор)
        </label>
        <input
          id="photoUrl"
          name="photoUrl"
          inputMode="url"
          className="input"
          placeholder="https://… (ако сте качили снимка някъде)"
        />
        <p className="mt-1 text-xs text-slate-500">
          Не е задължително. Ако нямате линк, опишете мястото подробно.
        </p>
      </div>

      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-700">
          Данни за връзка (по избор — не се показват публично)
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="name">
              Име
            </label>
            <input id="name" name="name" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="phone">
              Телефон
            </label>
            <input id="phone" name="phone" inputMode="tel" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="email">
              Имейл
            </label>
            <input id="email" name="email" inputMode="email" className="input" />
          </div>
        </div>
      </fieldset>

      {/* Honeypot против ботове */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />

      <p className="text-xs text-slate-500">
        Сигналите се преглеждат, преди да се покажат публично. Вижте{" "}
        <Link href="/poveritelnost" className="underline">
          Политиката за поверителност
        </Link>
        .
      </p>

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Изпращане…" : "Изпрати сигнала"}
      </button>
    </form>
  );
}
