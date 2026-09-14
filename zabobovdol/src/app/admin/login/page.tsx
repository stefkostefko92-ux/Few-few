"use client";

import { useActionState, use } from "react";
import { loginAction, type LoginState } from "@/lib/admin/auth-actions";
import { SITE } from "@/lib/site";

const initial: LoginState = {};

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = use(searchParams);
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-xl font-bold">{SITE.name}</div>
          <div className="text-sm text-slate-600">Вход в администрацията</div>
        </div>
        <form action={action} className="card space-y-4">
          {state.error && (
            <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </div>
          )}
          <input type="hidden" name="next" value={next ?? "/admin"} />
          <div>
            <label className="label" htmlFor="email">
              Имейл
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              className="input"
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
              required
              autoComplete="current-password"
              className="input"
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={pending}>
            {pending ? "Влизане…" : "Вход"}
          </button>
        </form>
      </div>
    </div>
  );
}
