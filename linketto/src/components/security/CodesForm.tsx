'use client';

import { useActionState } from 'react';
import type { CodesState } from '@/app/actions/security';
import { buttonStyles } from '@/components/ui/Button';

// Форма, чийто отговор са резервните кодове — показват се само тук, веднъж
// (не минават през адреса, бисквитки или логове).
export function CodesForm({
  action,
  locale,
  labels,
  errors,
  submitLabel,
  variant = 'primary',
}: {
  action: (state: CodesState, formData: FormData) => Promise<CodesState>;
  locale: string;
  labels: { code: string; codesTitle: string; codesHint: string; done: string };
  errors: Record<string, string>;
  submitLabel: string;
  variant?: 'primary' | 'secondary';
}) {
  const [state, formAction, pending] = useActionState(action, {});
  if (state.codes) {
    return (
      <div className="mt-4 rounded-card border border-success/40 bg-success-soft p-4">
        <p className="text-sm font-semibold text-fg">{labels.codesTitle}</p>
        <p className="mt-1 text-xs text-fg-2">{labels.codesHint}</p>
        <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm text-fg">
          {state.codes.map((code) => (
            <li key={code} className="rounded-control bg-surface px-2 py-1 text-center">
              {code}
            </li>
          ))}
        </ul>
        <a href={`/${locale}/dashboard/security`} className={buttonStyles({ size: 'sm', className: 'mt-4' })}>
          {labels.done}
        </a>
      </div>
    );
  }
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="uiLocale" value={locale} />
      <label className="block text-sm font-medium">
        {labels.code}
        <input
          name="code"
          required
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={20}
          className="mt-1 block w-40 rounded-control border border-line-input bg-surface px-3 py-2 text-center font-mono tracking-[0.2em]"
        />
      </label>
      <button type="submit" disabled={pending} className={buttonStyles({ variant, size: 'sm' })}>
        {submitLabel}
      </button>
      {state.error && (
        <p role="alert" className="basis-full text-sm text-danger-text">
          {errors[state.error] ?? errors.code}
        </p>
      )}
    </form>
  );
}
