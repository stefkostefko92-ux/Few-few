'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createProjectAction, updateProjectAction } from '@/server/project-actions';
import { initialFormState } from '@/server/form';
import type { ProjectKind } from '@/lib/schemas';

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

const KINDS: readonly ProjectKind[] = ['REPLACEMENT', 'FULL'];

type Field = (typeof FIELDS)[number][0] | 'notes';

/** A new installation says what it is for (`kind`: the module chosen on the dashboard); an existing one keeps it. The
 *  fields are controlled: a refused save keeps what was typed (React resets an uncontrolled form after its action). */
export default function ProjectForm({ initial, kind = 'FULL' }: { initial?: ProjectValues; kind?: ProjectKind }) {
  const t = useTranslations('projects'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(initial?.id ? updateProjectAction : createProjectAction, initialFormState);
  const [v, setV] = useState<Record<Field, string>>(() => ({
    name: initial?.name ?? '', plantNumber: initial?.plantNumber ?? '', address: initial?.address ?? '', city: initial?.city ?? '',
    province: initial?.province ?? '', client: initial?.client ?? '', notes: initial?.notes ?? '',
  }));
  const [chosen, setChosen] = useState<ProjectKind>(kind);
  const put = (k: Field, x: string): void => setV((p) => ({ ...p, [k]: x }));
  const bad = new Set(state.fields ?? []);
  return (
    <form action={action} className="panel" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {state.error ? <p className="alert alert-bad" role="alert">{te(state.error)}</p> : null}
      {initial?.id ? null : (
        <fieldset className="flex flex-col gap-2">
          <legend className="field-legend">{t('field_kind')}</legend>
          <div className="app-modules">
            {KINDS.map((k) => (
              <label key={k} className="app-module">
                <input type="radio" name="kind" value={k} checked={k === chosen} onChange={() => setChosen(k)} />
                <span className="eyebrow">{t(`kind_${k}`)}</span>
                <strong>{t(`module_${k}_title`)}</strong>
                <span className="note">{t(`module_${k}_lead`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="form-grid">
        {FIELDS.map(([name, max, required]) => (
          <label key={name} className={`field${name === 'name' ? ' span-2' : ''}`}>
            <span>{t(`field_${name}`)}{required ? ' *' : ''}</span>
            <input className="input" name={name} value={v[name]} onChange={(e) => put(name, e.target.value)} maxLength={max} required={required}
              aria-invalid={bad.has(name) || undefined} />
          </label>
        ))}
        <label className="field span-2">
          <span>{t('field_notes')}</span>
          <textarea className="input" name="notes" value={v.notes} onChange={(e) => put('notes', e.target.value)} maxLength={4000} />
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>{initial?.id ? t('save') : t('create')}</button>
      </div>
    </form>
  );
}
