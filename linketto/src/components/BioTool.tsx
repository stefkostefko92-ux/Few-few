'use client';

import { useActionState, useState } from 'react';
import { publicBioAction, type BioToolState } from '@/app/actions/tools';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Input, Label, Select, Textarea } from '@/components/ui/Field';

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
        <div className="space-y-1.5">
          <Label htmlFor="bio-name">{labels.name}</Label>
          <Input id="bio-name" type="text" name="name" maxLength={80} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bio-language">{labels.language}</Label>
          <Select id="bio-language" name="language" defaultValue={locale}>
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="bio-about">{labels.about}</Label>
          <Textarea
            id="bio-about"
            name="keywords"
            required
            maxLength={300}
            rows={3}
            placeholder={labels.aboutPlaceholder}
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? labels.generating : labels.generate}
          </Button>
          <p className="mt-3 text-small text-fg-muted">
            {labels.notice}
          </p>
        </div>
      </form>

      <div aria-live="polite">
        {state.error && (
          <Callout tone="danger">{labels.errors[state.error]}</Callout>
        )}
        {state.bio && (
          <figure className="rounded-card border border-accent/30 bg-accent-soft p-5">
            <figcaption className="text-small font-semibold text-accent-soft-fg">
              {labels.result}
            </figcaption>
            <p className="mt-2 text-lead text-fg">{state.bio}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={() => {
                void navigator.clipboard?.writeText(state.bio ?? '').then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              {copied ? labels.copied : labels.copy}
            </Button>
          </figure>
        )}
      </div>
    </div>
  );
}
