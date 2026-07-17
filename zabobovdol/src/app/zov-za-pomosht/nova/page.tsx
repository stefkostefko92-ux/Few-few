"use client";

import { useActionState } from "react";
import Link from "next/link";
import { PageHero } from "@/components/ui";
import { submitHelpCause, type HelpState } from "./actions";
import { PrivacyNote } from "@/components/PrivacyNote";

const initial: HelpState = { ok: false };

export default function NewHelpCausePage() {
  const [state, action, pending] = useActionState(submitHelpCause, initial);

  if (state.ok) {
    return (
      <>
        <PageHero
          title="Благодарим!"
          crumbs={[
            { name: "Зов за помощ", path: "/zov-za-pomosht" },
            { name: "Нов зов", path: "/zov-za-pomosht/nova" },
          ]}
        />
        <div className="container-content py-10">
          <div className="card max-w-xl bg-green-50">
            <p className="text-lg text-slate-800">
              Получихме вашия зов и ще го публикуваме след кратък преглед.
              Благодарим, че помагате на общността!
            </p>
            <Link href="/zov-za-pomosht" className="btn-primary mt-4">
              Към „Зов за помощ“
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHero
        title="Подайте зов за помощ"
        intro="Потърсете помощ за възрастен човек или предложете своята помощ/дарение. Публикува се след кратък преглед."
        crumbs={[
          { name: "Зов за помощ", path: "/zov-za-pomosht" },
          { name: "Нов зов", path: "/zov-za-pomosht/nova" },
        ]}
      />
      <div className="container-content py-10">
        <form action={action} className="max-w-2xl space-y-4">
          {state.error && (
            <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {state.error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="kind">
                Вид *
              </label>
              <select id="kind" name="kind" required className="input">
                <option value="NEED">Търся помощ за възрастен човек</option>
                <option value="OFFER">Предлагам помощ / дарение</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="location">
                Място / квартал
              </label>
              <input id="location" name="location" className="input" />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="title">
              Заглавие *
            </label>
            <input id="title" name="title" required maxLength={140} className="input" />
          </div>

          <div>
            <label className="label" htmlFor="beneficiary">
              За кого е (по избор)
            </label>
            <input id="beneficiary" name="beneficiary" className="input" placeholder="напр. самотна баба от кв. Миньор" />
          </div>

          <div>
            <label className="label" htmlFor="description">
              Описание *
            </label>
            <textarea id="description" name="description" required rows={6} maxLength={4000} className="input" placeholder="Каква помощ е нужна или какво предлагате?" />
            {/* Защита на чувствителни данни (чл. 9 GDPR): публикацията е публична. */}
            <p className="mt-2 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-sm text-slate-700">
              <strong>Важно:</strong> обявата е публична. Ако пишете за друг
              човек, първо вземете съгласието му. <strong>Не посочвайте</strong>{" "}
              здравословно състояние, диагнози или други чувствителни данни —
              опишете само каква помощ е нужна.
            </p>
          </div>

          <fieldset className="rounded-lg border border-slate-200 p-4">
            <legend className="px-1 text-sm font-medium text-slate-700">Данни за контакт</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="contactName">Име</label>
                <input id="contactName" name="contactName" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="contactPhone">Телефон</label>
                <input id="contactPhone" name="contactPhone" inputMode="tel" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="contactEmail">Имейл</label>
                <input id="contactEmail" name="contactEmail" inputMode="email" className="input" />
              </div>
            </div>
          </fieldset>

          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

          <p className="text-xs text-slate-600">
            Посочете поне телефон или имейл. Внимавайте при дарения — не превеждайте
            пари на непознати без проверка.
          </p>

          <PrivacyNote />

          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Изпращане…" : "Изпратете"}
          </button>
        </form>
      </div>
    </>
  );
}
