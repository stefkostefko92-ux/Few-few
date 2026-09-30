'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createProjectAction, updateProjectAction } from '@/server/project-actions';
import { initialFormState } from '@/server/form';

export interface ProjectValues {
  id?: string;
  name: string;
  address: string;
  city: string;
  province: string;
  plantNumber: string;
  client: string;
  notes: string;
}

const FIELDS = [
  ['name', 160, true], ['plantNumber', 80, false], ['address', 200, false], ['city', 120, false], ['province', 40, false], ['client', 160, false],
] as const;

export default function ProjectForm({ initial }: { initial?: ProjectValues }) {
  const t = useTranslations('projects'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(initial?.id ? updateProjectAction : createProjectAction, initialFormState);
  const bad = new Set(state.fields ?? []);
  return (
    <form action={action} className="panel" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {state.error ? <p className="alert alert-bad" role="alert">{te(state.error)}</p> : null}
      <div className="form-grid">
        {FIELDS.map(([name, max, required]) => (
          <label key={name} className={`field${name === 'name' ? ' span-2' : ''}`}>
            <span>{t(`field_${name}`)}{required ? ' *' : ''}</span>
            <input className="input" name={name} defaultValue={initial?.[name] ?? ''} maxLength={max} required={required}
              aria-invalid={bad.has(name) || undefined} />
          </label>
        ))}
        <label className="field span-2">
          <span>{t('field_notes')}</span>
          <textarea className="input" name="notes" defaultValue={initial?.notes ?? ''} maxLength={4000} />
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>{initial?.id ? t('save') : t('create')}</button>
      </div>
    </form>
  );
}
