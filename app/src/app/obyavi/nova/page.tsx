"use client";

import { useActionState } from "react";
import Link from "next/link";
import { PageHero } from "@/components/ui";
import { LISTING_TYPE_LABELS } from "@/lib/categories";
import { submitListing, type SubmitState } from "./actions";

const initial: SubmitState = { ok: false };

export default function NewListingPage() {
  const [state, action, pending] = useActionState(submitListing, initial);

  if (state.ok) {
    return (
      <>
        <PageHero
          title="Благодарим!"
          crumbs={[
            { name: "Обяви", path: "/obyavi" },
            { name: "Нова обява", path: "/obyavi/nova" },
          ]}
        />
        <div className="container-content py-10">
          <div className="card max-w-xl bg-green-50">
            <p className="text-lg text-slate-800">
              Обявата ви е получена и ще бъде публикувана след кратък преглед.
            </p>
            <Link href="/obyavi" className="btn-primary mt-4">
              Към обявите
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHero
        title="Подай безплатна обява"
        intro="Попълнете формата. Обявата се публикува след кратък преглед, за да няма спам."
        crumbs={[
          { name: "Обяви", path: "/obyavi" },
          { name: "Нова обява", path: "/obyavi/nova" },
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
            <label className="label" htmlFor="title">
              Заглавие *
            </label>
            <input id="title" name="title" required className="input" maxLength={120} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="type">
                Вид *
              </label>
              <select id="type" name="type" required className="input">
                {Object.entries(LISTING_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="price">
                Цена (по избор)
              </label>
              <input id="price" name="price" className="input" placeholder="напр. 50 лв." />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="description">
              Описание *
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={6}
              className="input"
              maxLength={4000}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="contactName">
                Име
              </label>
              <input id="contactName" name="contactName" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="contactPhone">
                Телефон
              </label>
              <input id="contactPhone" name="contactPhone" className="input" inputMode="tel" />
            </div>
            <div>
              <label className="label" htmlFor="contactEmail">
                Имейл
              </label>
              <input id="contactEmail" name="contactEmail" className="input" inputMode="email" />
            </div>
          </div>

          {/* Honeypot — скрито поле за ботове */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden
          />

          <p className="text-xs text-slate-500">
            Посочете поне телефон или имейл за контакт. С подаването приемате
            обявата да бъде видима публично.
          </p>

          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Изпращане…" : "Изпрати обявата"}
          </button>
        </form>
      </div>
    </>
  );
}
