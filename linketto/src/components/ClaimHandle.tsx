'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { normalizeSlug } from '@/lib/slug';

// „Запази си името“ в hero-то (облик: .lx-claim* в components/landing/lx.css): пишеш името → проверка на живо дали е
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
      className="lx-claim"
      onSubmit={(event) => {
        if (blocked || !slug) event.preventDefault();
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        {labels.label}
      </label>
      <div className="lx-claim-box">
        <div className="lx-claim-field">
          <span className="lx-claim-prefix">{prefix}</span>
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
            className="lx-claim-input"
          />
        </div>
        <button
          type="submit"
          disabled={blocked}
          className="lx-claim-submit"
          data-magnet
        >
          {labels.cta}
        </button>
      </div>
      <p
        id={`${inputId}-status`}
        aria-live="polite"
        className="lx-claim-status"
        data-state={status === 'available' ? 'available' : blocked ? 'bad' : 'idle'}
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
