'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { normalizeSlug } from '@/lib/slug';
import { Button } from '@/components/ui/Button';

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
      className="w-full max-w-xl"
      onSubmit={(event) => {
        if (blocked || !slug) event.preventDefault();
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        {labels.label}
      </label>
      <div className="flex flex-col gap-2 rounded-card border border-line-input bg-surface p-1.5 shadow-e2 transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-focus sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center px-3 py-2.5">
          <span className="max-w-[55%] shrink-0 truncate text-body font-medium text-fg-muted sm:max-w-none">
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
            className="min-w-0 flex-1 bg-transparent text-[1rem] font-semibold text-fg placeholder:font-medium placeholder:text-fg-muted focus:outline-none"
          />
        </div>
        <Button type="submit" size="lg" disabled={blocked}>
          {labels.cta}
        </Button>
      </div>
      <p
        id={`${inputId}-status`}
        aria-live="polite"
        className={`mt-2 min-h-5 px-1 text-small font-medium ${
          status === 'available'
            ? 'text-success-text'
            : blocked
              ? 'text-danger-text'
              : 'text-fg-muted'
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
