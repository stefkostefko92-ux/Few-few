"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { LegalFooter } from "@/components/LegalFooter";

const initial: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initial);

  return (
    <main className="flex min-h-screen flex-col px-4">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-white">Платформа</h1>
          <p className="mt-1 text-sm text-ink-400">
            Управление на свързаните сайтове
          </p>
        </div>
        <form action={formAction} className="card space-y-4">
          <div>
            <label className="label" htmlFor="email">
              Имейл
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              className="input"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Парола
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="input"
            />
          </div>
          {state.error && (
            <p className="text-sm text-red-400" role="alert">
              {state.error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={pending}>
            {pending ? "Влизане…" : "Вход"}
          </button>
          <div className="flex items-center justify-between text-xs text-ink-500">
            <Link href="/register" className="text-brand-400 hover:underline">Създай акаунт</Link>
            <Link href="/forgot" className="hover:text-ink-300">Забравена парола?</Link>
          </div>
        </form>
        </div>
      </div>
      <LegalFooter />
    </main>
  );
}
