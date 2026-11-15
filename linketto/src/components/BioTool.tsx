'use client';

import { useActionState, useState } from 'react';
import { publicBioAction, type BioToolState } from '@/app/actions/tools';

// Публичният AI генератор на био: форма → server action (лимит по IP) →
// готов текст с „Копирай“. Нищо не се записва.

export function BioTool({
  locale,
  languages,
  labels,
}: {
  locale: string;
  languages: { code: string; name: string }[];
  labels: {
    name: string;
    about: string;
    aboutPlaceholder: string;
    language: string;
    generate: string;
    generating: string;
    result: string;
    copy: string;
    copied: string;
    notice: string;
    errors: Record<NonNullable<BioToolState['error']>, string>;
  };
}) {
  const [state, action, pending] = useActionState(publicBioAction, {});
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-6">
      <form action={action} className="grid gap-5 sm:grid-cols-2">
        {/* honeypot — скрит за хора */}
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />
        <label className="block text-sm font-semibold text-slate-800">
          {labels.name}
          <input type="text" name="name" maxLength={80} className="auth-field" />
        </label>
        <label className="block text-sm font-semibold text-slate-800">
          {labels.language}
          <select name="language" defaultValue={locale} className="auth-field">
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-800 sm:col-span-2">
          {labels.about}
          <textarea
            name="keywords"
            required
            maxLength={300}
            rows={3}
            placeholder={labels.aboutPlaceholder}
            className="auth-field resize-y"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="btn-shine rounded-full bg-linketto-600 px-6 py-3 font-semibold text-white shadow-lg shadow-linketto-600/25 transition hover:-translate-y-0.5 hover:bg-linketto-700 disabled:cursor-wait disabled:opacity-70"
          >
            {pending ? labels.generating : labels.generate}
          </button>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            {labels.notice}
          </p>
        </div>
      </form>

      <div aria-live="polite">
        {state.error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {labels.errors[state.error]}
          </p>
        )}
        {state.bio && (
          <figure className="rounded-2xl border border-linketto-200 bg-linketto-50/70 p-5">
            <figcaption className="text-xs font-semibold uppercase tracking-wider text-linketto-700">
              {labels.result}
            </figcaption>
            <p className="mt-2 text-lg leading-relaxed text-slate-900">{state.bio}</p>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(state.bio ?? '').then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="mt-4 rounded-full border border-linketto-600 px-4 py-1.5 text-sm font-semibold text-linketto-700 transition hover:bg-white"
            >
              {copied ? labels.copied : labels.copy}
            </button>
          </figure>
        )}
      </div>
    </div>
  );
}
