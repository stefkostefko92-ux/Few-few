"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction, type RegisterState } from "./actions";
import { LegalFooter } from "@/components/LegalFooter";

const initial: RegisterState = {};

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, initial);

  return (
    <main className="flex min-h-screen flex-col px-4">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-white">Създай акаунт</h1>
            <p className="mt-1 text-sm text-ink-400">Започни да строиш сайта си за минути</p>
          </div>
          <form action={formAction} className="card space-y-4">
            <input type="text" name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
            <div>
              <label className="label" htmlFor="name">Име</label>
              <input id="name" name="name" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="email">Имейл</label>
              <input id="email" name="email" type="email" autoComplete="username" required className="input" placeholder="you@example.com" />
            </div>
            <div>
              <label className="label" htmlFor="password">Парола (мин. 10 знака)</label>
              <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} className="input" />
            </div>
            {state.error && <p className="text-sm text-red-400" role="alert">{state.error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={pending}>
              {pending ? "Създаване…" : "Създай акаунт"}
            </button>
            <p className="text-center text-xs text-ink-500">
              Вече имате акаунт?{" "}
              <Link href="/login" className="text-brand-400 hover:underline">Вход</Link>
            </p>
            <p className="text-center text-[11px] text-ink-600">
              С регистрацията приемате{" "}
              <Link href="/legal/usloviya" className="underline">Общите условия</Link>.
            </p>
          </form>
        </div>
      </div>
      <LegalFooter />
    </main>
  );
}
