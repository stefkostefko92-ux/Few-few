"use client";

import { useActionState, useState, useTransition } from "react";
import {
  begin2faAction,
  enable2faAction,
  disable2faAction,
  type ProfileState,
} from "@/app/dashboard/profile/actions";

const initial: ProfileState = {};

export function TwoFactorSetup({ enabled: initialEnabled }: { enabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [pending, start] = useTransition();
  const [enableState, enableAction] = useActionState(
    async (prev: ProfileState, fd: FormData) => {
      const r = await enable2faAction(prev, fd);
      if (r.ok) {
        setEnabled(true);
        setSetup(null);
      }
      return r;
    },
    initial,
  );
  const [disableState, disableAction] = useActionState(
    async (prev: ProfileState, fd: FormData) => {
      const r = await disable2faAction(prev, fd);
      if (r.ok) setEnabled(false);
      return r;
    },
    initial,
  );

  function begin() {
    start(async () => {
      const r = await begin2faAction();
      if (r.secret && r.uri) setSetup({ secret: r.secret, uri: r.uri });
    });
  }

  if (enabled) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-green-400">✓ Двуфакторната автентикация е включена.</p>
        <form action={disableAction} className="space-y-2">
          <label className="label" htmlFor="pw2">Парола (за изключване)</label>
          <input id="pw2" name="password" type="password" required className="input" />
          <button className="btn-ghost px-3 py-1.5 text-xs text-red-400" disabled={pending}>
            Изключи 2FA
          </button>
          {disableState.error && <p className="text-sm text-red-400">{disableState.error}</p>}
        </form>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-ink-400">
          Добавете допълнителна защита с приложение (Google Authenticator, Authy и др.).
        </p>
        <button className="btn-primary px-3 py-1.5 text-xs" onClick={begin} disabled={pending}>
          {pending ? "…" : "Включи 2FA"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-300">
        1) Добавете в приложението си този ключ (или отворете adresa):
      </p>
      <div className="rounded border border-ink-800 bg-ink-950 p-2 text-xs">
        <p className="text-ink-500">Ключ (ръчно):</p>
        <p className="break-all font-mono text-ink-200">{setup.secret}</p>
        <p className="mt-1 break-all text-ink-600">{setup.uri}</p>
      </div>
      <form action={enableAction} className="space-y-2">
        <label className="label" htmlFor="code2">2) Въведете кода от приложението</label>
        <input id="code2" name="code" inputMode="numeric" maxLength={6} required className="input tracking-widest" placeholder="123456" />
        <button className="btn-primary px-3 py-1.5 text-xs">Потвърди и включи</button>
        {enableState.error && <p className="text-sm text-red-400">{enableState.error}</p>}
      </form>
    </div>
  );
}
