"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "@/components/icons";
import { PageHero } from "@/components/ui";
import { submitPhoto, type PhotoState } from "./actions";
import { SITE } from "@/lib/site";

const initial: PhotoState = { ok: false };

export default function NewPhotoPage() {
  const [state, action, pending] = useActionState(submitPhoto, initial);

  if (state.ok) {
    return (
      <>
        <PageHero
          title="Благодарим за снимката!"
          crumbs={[
            { name: "Галерия", path: "/galeriya" },
            { name: "Нова снимка", path: "/galeriya/nova" },
          ]}
        />
        <div className="container-content py-10">
          <div className="card max-w-xl bg-green-50">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-700" aria-hidden />
              <p className="text-lg font-semibold text-slate-800">Снимката е получена.</p>
            </div>
            <p className="mt-2 text-slate-700">
              Ще я прегледаме и след одобрение ще се появи в галерията — с кредит към
              вас като автор.
            </p>
            <Link href="/galeriya" className="btn-primary mt-4">
              Към галерията
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHero
        title="Споделете снимка на Бобов дол"
        intro="Имате хубава снимка на града — стара или нова? Споделете я и ще я покажем в галерията с вашето име като автор."
        crumbs={[
          { name: "Галерия", path: "/galeriya" },
          { name: "Нова снимка", path: "/galeriya/nova" },
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
              Какво е на снимката? *
            </label>
            <input
              id="title"
              name="title"
              required
              maxLength={140}
              className="input"
              placeholder="напр. „Центърът на Бобов дол през зимата“"
            />
          </div>

          <div>
            <label className="label" htmlFor="author">
              Кой направи снимката? (за кредит) *
            </label>
            <input
              id="author"
              name="author"
              required
              maxLength={80}
              className="input"
              placeholder="Вашето име или името на автора"
            />
          </div>

          <div>
            <label className="label" htmlFor="photo">
              Качи снимка от телефона или компютъра
            </label>
            <input
              id="photo"
              name="photo"
              type="file"
              accept="image/*"
              className="block w-full rounded-lg border border-slate-300 bg-white p-2.5 text-base file:mr-3 file:rounded-md file:border-0 file:bg-brand-700 file:px-4 file:py-2 file:text-white"
            />
            <p className="mt-1 text-xs text-slate-500">
              Натиснете бутона и изберете снимка (JPG, PNG, до 8 MB). На телефон може да
              изберете и направена в момента снимка.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="imageUrl">
              Или линк към снимка (по избор)
            </label>
            <input
              id="imageUrl"
              name="imageUrl"
              inputMode="url"
              className="input"
              placeholder="https://… (ако снимката вече е качена някъде)"
            />
            <p className="mt-1 text-xs text-slate-500">
              Ако не можете да качите файл, изпратете ни снимката по Viber или имейл на{" "}
              {SITE.contact.phone} / {SITE.contact.email} — ние ще я качим.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="contact">
              Ваш телефон или имейл (по избор, не се показва)
            </label>
            <input id="contact" name="contact" className="input" />
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

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            <p>
              <strong>Съгласие:</strong> Като качите снимка чрез бутона, давате на сайта
              „За Бобов дол“ правото да я използва и на други места (например в
              страниците и материалите на проекта и в социалните мрежи). Винаги ще
              добавяме <strong>кредит с името на автора</strong>, което сте посочили.
            </p>
            <p className="mt-2">
              С подаването потвърждавате, че вие сте направили снимката или имате право
              да я споделите. Снимките се преглеждат преди да се покажат публично.
            </p>
          </div>

          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Изпращане…" : "Изпрати снимката"}
          </button>
        </form>
      </div>
    </>
  );
}
