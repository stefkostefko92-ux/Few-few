'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { normalizeSlug } from '@/lib/slug';

// „Запази си името“ в hero-то: пишеш името → проверка на живо дали е
// свободно → регистрацията го създава веднага (?handle=). Работи и без JS
// (обикновена GET форма към /register).

type Status = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'reserved';

export function ClaimHandle({
  locale,
  prefix,
  labels,
}: {
  locale: string;
  prefix: string;
  labels: {
    label: string;
    placeholder: string;
    cta: string;
    checking: string;
    available: string;
    taken: string;
    invalid: string;
    reserved: string;
  };
}) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputId = useId();
  const slug = normalizeSlug(value);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!slug) {
      setStatus('idle');
      return;
    }
    setStatus('checking');
    const controller = new AbortController();
    timer.current = setTimeout(() => {
      fetch(`/api/handle?slug=${encodeURIComponent(slug)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { available?: boolean; reason?: Status } | null) => {
          if (!data) return setStatus('idle');
          setStatus(data.available ? 'available' : (data.reason ?? 'invalid'));
        })
        .catch(() => undefined);
    }, 350);
    return () => {
      controller.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [slug]);

  const message =
    status === 'idle' ? '' : labels[status as Exclude<Status, 'idle'>];
  const blocked = status === 'taken' || status === 'invalid' || status === 'reserved';

  return (
    <form
      action={`/${locale}/register`}
      method="get"
      className="mx-auto w-full max-w-xl lg:mx-0"
      onSubmit={(event) => {
        if (blocked || !slug) event.preventDefault();
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        {labels.label}
      </label>
      <div className="flex flex-col gap-2 rounded-3xl border border-white/20 bg-white/10 p-2 shadow-2xl shadow-sky-500/10 backdrop-blur-md transition focus-within:border-white/50 sm:flex-row sm:items-center sm:rounded-full">
        <div className="flex min-w-0 flex-1 items-center rounded-full bg-slate-950/40 px-4 py-3">
          <span className="max-w-[55%] shrink-0 truncate text-sm font-medium text-slate-400 sm:max-w-none">
            {prefix}
          </span>
          <input
            id={inputId}
            name="handle"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={labels.placeholder}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={40}
            aria-describedby={`${inputId}-status`}
            className="min-w-0 flex-1 bg-transparent text-base font-semibold text-white placeholder:text-slate-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={blocked}
          className="btn-shine rounded-full bg-white px-6 py-3 font-semibold text-slate-900 shadow-lg shadow-sky-500/20 transition hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-sky-400/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {labels.cta}
        </button>
      </div>
      <p
        id={`${inputId}-status`}
        aria-live="polite"
        className={`mt-2 min-h-5 px-4 text-sm font-medium ${
          status === 'available'
            ? 'text-emerald-300'
            : blocked
              ? 'text-rose-300'
              : 'text-slate-400'
        }`}
      >
        {message && slug ? (
          <>
            {status === 'available' ? '✓ ' : ''}
            {message.replace('{slug}', slug)}
          </>
        ) : null}
      </p>
    </form>
  );
}
