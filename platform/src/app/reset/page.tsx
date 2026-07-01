"use client";

import { use } from "react";
import Link from "next/link";
import { useActionState } from "react";
import { resetAction, type ResetState } from "./actions";
import { LegalFooter } from "@/components/LegalFooter";

const initial: ResetState = {};

export default function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = use(searchParams);
  const [state, formAction, pending] = useActionState(resetAction, initial);

  return (
    <main className="flex min-h-screen flex-col px-4">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-white">Нова парола</h1>
          </div>
          {!token ? (
            <div className="card text-sm text-red-400">
              Липсва или невалиден линк.{" "}
              <Link href="/forgot" className="underline">Заявете нов</Link>.
            </div>
          ) : (
            <form action={formAction} className="card space-y-4">
              <input type="hidden" name="token" value={token} />
              <div>
                <label className="label" htmlFor="password">Нова парола (мин. 10 знака)</label>
                <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} className="input" />
              </div>
              {state.error && <p className="text-sm text-red-400" role="alert">{state.error}</p>}
              <button type="submit" className="btn-primary w-full" disabled={pending}>
                {pending ? "Запазване…" : "Задай нова парола"}
              </button>
            </form>
          )}
        </div>
      </div>
      <LegalFooter />
    </main>
  );
}
