"use client";

import { useActionState } from "react";
import Link from "next/link";
import { PageHero } from "@/components/ui";
import { submitRideshare, type RideState } from "./actions";
import { PrivacyNote } from "@/components/PrivacyNote";

const initial: RideState = { ok: false };

export default function NewRidePage() {
  const [state, action, pending] = useActionState(submitRideshare, initial);

  if (state.ok) {
    return (
      <>
        <PageHero
          title="Благодарим!"
          crumbs={[
            { name: "Споделено пътуване", path: "/spodeleno-patuvane" },
            { name: "Нова обява", path: "/spodeleno-patuvane/nova" },
          ]}
        />
        <div className="container-content py-10">
          <div className="card max-w-xl bg-green-50">
            <p className="text-lg text-slate-800">
              Обявата е получена и ще се публикува след кратък преглед. Приятен и
              споделен път!
            </p>
            <Link href="/spodeleno-patuvane" className="btn-primary mt-4">
              Към споделените пътувания
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHero
        title="Споделено пътуване — нова обява"
        intro="Пътувате редовно по даден маршрут? Предложете място в колата или потърсете спътници и споделете разходите. Публикува се след кратък преглед."
        crumbs={[
          { name: "Споделено пътуване", path: "/spodeleno-patuvane" },
          { name: "Нова обява", path: "/spodeleno-patuvane/nova" },
        ]}
      />
      <div className="container-content py-10">
        <form action={action} className="max-w-2xl space-y-4">
          {state.error && (
            <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {state.error}
            </div>
          )}

          <div>
            <label className="label" htmlFor="kind">Вид *</label>
            <select id="kind" name="kind" required className="input">
              <option value="OFFER">Предлагам място в колата (шофьор)</option>
              <option value="NEED">Търся превоз / спътници</option>
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="routeFrom">Откъде *</label>
              <input id="routeFrom" name="routeFrom" required maxLength={80} className="input" placeholder="напр. Бобов дол" />
            </div>
            <div>
              <label className="label" htmlFor="routeTo">Докъде *</label>
              <input id="routeTo" name="routeTo" required maxLength={80} className="input" placeholder="напр. Дупница" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="schedule">Кога (дни/час)</label>
              <input id="schedule" name="schedule" className="input" placeholder="напр. делник, 7:30" />
            </div>
            <div>
              <label className="label" htmlFor="seats">Свободни места</label>
              <input id="seats" name="seats" className="input" placeholder="напр. 3" />
            </div>
            <div>
              <label className="label" htmlFor="costNote">Дял от разхода</label>
              <input id="costNote" name="costNote" className="input" placeholder="напр. по 3 лв" />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="description">Допълнително (по избор)</label>
            <textarea id="description" name="description" rows={4} maxLength={2000} className="input" />
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
            Посочете поне телефон или имейл. За сигурност се уговаряйте предварително
            и не плащайте на непознати без яснота.
          </p>

          <PrivacyNote />

          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Изпращане…" : "Публикувай обявата"}
          </button>
        </form>
      </div>
    </>
  );
}
