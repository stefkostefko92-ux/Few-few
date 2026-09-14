"use client";

import { useActionState } from "react";
import Link from "next/link";
import { PageHero } from "@/components/ui";
import { submitVolunteer, type VolunteerState } from "./actions";
import { PrivacyNote } from "@/components/PrivacyNote";

const initial: VolunteerState = { ok: false };

export default function BecomeVolunteerPage() {
  const [state, action, pending] = useActionState(submitVolunteer, initial);

  if (state.ok) {
    return (
      <>
        <PageHero
          title="Благодарим ви!"
          crumbs={[
            { name: "Доброволци", path: "/dobrovolci" },
            { name: "Стани доброволец", path: "/dobrovolci/stani" },
          ]}
        />
        <div className="container-content py-10">
          <div className="card max-w-xl bg-green-50">
            <p className="text-lg text-slate-800">
              Записахме ви като доброволец. Ще се свържем с вас и ще ви включим в
              мрежата след кратък преглед. Благодарим, че помагате на хората!
            </p>
            <Link href="/dobrovolci" className="btn-primary mt-4">
              Към доброволците
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHero
        title="Станете доброволец"
        intro="Отделете малко време, за да помогнете на възрастен човек — с телефон, документи, пазар или просто компания. Записването минава през кратък преглед."
        crumbs={[
          { name: "Доброволци", path: "/dobrovolci" },
          { name: "Стани доброволец", path: "/dobrovolci/stani" },
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
              <label className="label" htmlFor="name">Име *</label>
              <input id="name" name="name" required maxLength={80} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="area">Квартал / район</label>
              <input id="area" name="area" className="input" placeholder="напр. кв. Миньор" />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="skills">С какво можете да помогнете? *</label>
            <input id="skills" name="skills" required maxLength={300} className="input" placeholder="напр. телефон и интернет, пазар, документи, компания" />
          </div>

          <div>
            <label className="label" htmlFor="about">Няколко думи за вас (по избор)</label>
            <textarea id="about" name="about" rows={3} maxLength={1500} className="input" />
          </div>

          <fieldset className="rounded-lg border border-slate-200 p-4">
            <legend className="px-1 text-sm font-medium text-slate-700">
              Данни за връзка (виждат се само от екипа)
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="phone">Телефон</label>
                <input id="phone" name="phone" inputMode="tel" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="email">Имейл</label>
                <input id="email" name="email" inputMode="email" className="input" />
              </div>
            </div>
          </fieldset>

          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

          <p className="text-xs text-slate-600">
            Данните ви за контакт не се показват публично — служат само на екипа,
            за да ви свърже с хора, които се нуждаят от помощ.
          </p>

          <PrivacyNote />

          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Изпращане…" : "Запишете ме"}
          </button>
        </form>
      </div>
    </>
  );
}
