"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotAction, type ForgotState } from "./actions";
import { LegalFooter } from "@/components/LegalFooter";

const initial: ForgotState = {};

export default function ForgotPage() {
  const [state, formAction, pending] = useActionState(forgotAction, initial);

  return (
    <main className="flex min-h-screen flex-col px-4">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-white">Забравена парола</h1>
            <p className="mt-1 text-sm text-ink-400">Ще ви изпратим линк за възстановяване</p>
          </div>
          {state.ok ? (
            <div className="card text-sm text-ink-200">
              Ако има акаунт с този имейл, изпратихме линк за възстановяване. Проверете пощата си.
              <div className="mt-4">
                <Link href="/login" className="text-brand-400 hover:underline">← Към входа</Link>
              </div>
            </div>
          ) : (
            <form action={formAction} className="card space-y-4">
              <div>
                <label className="label" htmlFor="email">Имейл</label>
                <input id="email" name="email" type="email" required className="input" placeholder="you@example.com" />
              </div>
              {state.error && <p className="text-sm text-red-400" role="alert">{state.error}</p>}
              <button type="submit" className="btn-primary w-full" disabled={pending}>
                {pending ? "Изпращане…" : "Изпрати линк"}
              </button>
              <p className="text-center text-xs text-ink-500">
                <Link href="/login" className="text-brand-400 hover:underline">← Към входа</Link>
              </p>
            </form>
          )}
        </div>
      </div>
      <LegalFooter />
    </main>
  );
}
