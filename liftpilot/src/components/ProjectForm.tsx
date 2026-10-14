'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createProjectAction, updateProjectAction } from '@/server/project-actions';
import { initialFormState } from '@/server/form';
import type { ProjectKind } from '@/lib/schemas';
import { DalRilievo, OrigineProvider, type OrigineRilievo } from './collega/origine';

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

/** A new installation says what it is for (`kind`: the module chosen on the dashboard; null — from a survey, where the
 *  user must choose it: nothing is preselected); an existing one keeps it. The
 *  fields are controlled: a refused save keeps what was typed (React resets an uncontrolled form after its action).
 *  `fills`: the modules whose form the user fills (rbac.ts formRightOf); for another one the form says that the
 *  installation is created with its data and its work is a colleague's. `rilievo` (round 44): a new installation made
 *  from a survey (linked to it when created) or the data taken from the survey on purpose — the values marked «dal
 *  rilievo» while they are the survey's. */
export default function ProjectForm({ initial, kind = 'FULL', fills = KINDS, rilievo = null }: {
  initial?: ProjectValues; kind?: ProjectKind | null; fills?: readonly ProjectKind[]; rilievo?: { id: string | null; origine: OrigineRilievo } | null;
}) {
  const t = useTranslations('projects'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(initial?.id ? updateProjectAction : createProjectAction, initialFormState);
  const [v, setV] = useState<Record<Field, string>>(() => ({
    name: initial?.name ?? '', plantNumber: initial?.plantNumber ?? '', address: initial?.address ?? '', city: initial?.city ?? '',
    province: initial?.province ?? '', client: initial?.client ?? '', notes: initial?.notes ?? '',
  }));
  const [chosen, setChosen] = useState<ProjectKind | null>(kind);
  const put = (k: Field, x: string): void => setV((p) => ({ ...p, [k]: x }));
  const bad = new Set(state.fields ?? []);
  return (
    <OrigineProvider value={rilievo?.origine ?? null}>
    <form action={action} className="panel" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {rilievo?.id ? <input type="hidden" name="rilievo" value={rilievo.id} /> : null}
      {state.error ? <p className="alert alert-bad" role="alert">{te(state.error)}</p> : null}
      {initial?.id ? null : (
        <fieldset className="flex flex-col gap-2" aria-describedby={chosen ? undefined : 'kind-choose'}>
          <legend className="field-legend">{t('field_kind')} *</legend>
          {chosen ? null : <p id="kind-choose" className={bad.has('kind') ? 'alert alert-warn' : 'note'} role={bad.has('kind') ? 'alert' : undefined}>{t('kindChoose')}</p>}
          <div className="app-modules">
            {KINDS.map((k) => (
              <label key={k} className="app-module">
                <input type="radio" name="kind" value={k} checked={k === chosen} onChange={() => setChosen(k)} required aria-invalid={(bad.has('kind') && !chosen) || undefined} />
                <span className="eyebrow">{t(`kind_${k}`)}</span>
                <strong>{t(`module_${k}_title`)}</strong>
                <span className="note">{t(`module_${k}_lead`)}</span>
              </label>
            ))}
          </div>
          {!chosen || fills.includes(chosen) ? null : <p className="alert alert-info" role="status">{t('createOnly', { kind: chosen })}</p>}
        </fieldset>
      )}
      <div className="form-grid">
        {FIELDS.map(([name, max, required]) => (
          <label key={name} className={`field${name === 'name' ? ' span-2' : ''}`}>
            <span>{t(`field_${name}`)}{required ? ' *' : ''}<DalRilievo id={name} value={v[name]} /></span>
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
    </OrigineProvider>
  );
}
