"use client";

import { useActionState } from "react";
import Link from "next/link";
import { PageHero } from "@/components/ui";
import { submitMemory, type MemoryState } from "./actions";

const initial: MemoryState = { ok: false };

export default function NewMemoryPage() {
  const [state, action, pending] = useActionState(submitMemory, initial);

  if (state.ok) {
    return (
      <>
        <PageHero
          title="Благодарим за спомена!"
          crumbs={[
            { name: "Спомени", path: "/spomeni" },
            { name: "Нов спомен", path: "/spomeni/nov" },
          ]}
        />
        <div className="container-content py-10">
          <div className="card max-w-xl bg-green-50">
            <p className="text-lg text-slate-800">
              Получихме вашия спомен и ще го публикуваме след кратък преглед.
              Така заедно пазим историята на Дупница жива.
            </p>
            <Link href="/spomeni" className="btn-primary mt-4">
              Към „Спомени“
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHero
        title="Споделете спомен"
        intro="Разкажете спомен от стария Дупница — за фабриките, училището, празниците, хората. Публикува се след кратък преглед."
        crumbs={[
          { name: "Спомени", path: "/spomeni" },
          { name: "Нов спомен", path: "/spomeni/nov" },
        ]}
      />
      <div className="container-content py-10">
        <form action={action} className="max-w-2xl space-y-4">
          {state.error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {state.error}
            </div>
          )}

          <div>
            <label className="label" htmlFor="title">
              Заглавие *
            </label>
            <input id="title" name="title" required maxLength={140} className="input" placeholder="напр. Празникът на града през 80-те" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="author">
                Вашето име (по избор)
              </label>
              <input id="author" name="author" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="period">
                Период (по избор)
              </label>
              <input id="period" name="period" className="input" placeholder="напр. 1980-те" />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="content">
              Спомен *
            </label>
            <textarea id="content" name="content" required rows={8} maxLength={6000} className="input" placeholder="Разкажете спомена със свои думи…" />
          </div>

          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

          <p className="text-xs text-slate-500">
            Споделяйте само спомени, които искате да са публични. Имате стара
            снимка? Споменете в текста и ще я добавим след връзка с вас.
          </p>

          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Изпращане…" : "Споделете спомена"}
          </button>
        </form>
      </div>
    </>
  );
}
