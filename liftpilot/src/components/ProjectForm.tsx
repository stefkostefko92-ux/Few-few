'use client';

import { useActionState, useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createProjectAction, updateProjectAction } from '@/server/project-actions';
import { initialFormState } from '@/server/form';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../messages/aiuto/impianti.json';
import { DalRilievo, OrigineProvider, type OrigineRilievo } from './collega/origine';
import Etichetta from './aiuto/Etichetta';

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

type Field = (typeof FIELDS)[number][0] | 'notes';

/** An installation's data: what identifies it, nothing of its work — the type of intervention is chosen in its
 *  «Calcolo argano» (round 45). The fields are controlled: a refused save keeps what was typed (React resets an
 *  uncontrolled form after its action). `calcola`: whoever makes the calculations (a new installation opens on its
 *  calculation); else the form says that the installation is created with its data and its calculation is a
 *  colleague's. `rilievo` (round 44): a new installation made from a survey (linked to it when created) or the data
 *  taken from the survey on purpose — the values marked «dal rilievo» while they are the survey's. */
export default function ProjectForm({ initial, calcola = true, rilievo = null }: {
  initial?: ProjectValues; calcola?: boolean; rilievo?: { id: string | null; origine: OrigineRilievo } | null;
}) {
  const t = useTranslations('projects'), te = useTranslations('errors'), locale = useLocale(), uid = useId();
  const [state, action, pending] = useActionState(initial?.id ? updateProjectAction : createProjectAction, initialFormState);
  const [v, setV] = useState<Record<Field, string>>(() => ({
    name: initial?.name ?? '', plantNumber: initial?.plantNumber ?? '', address: initial?.address ?? '', city: initial?.city ?? '',
    province: initial?.province ?? '', client: initial?.client ?? '', notes: initial?.notes ?? '',
  }));
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
        <p className="note tipo-dopo" id="tipo-dopo">{t('tipoNelCalcolo')}{calcola ? '' : ` ${t('createOnly')}`}</p>
      )}
      <div className="form-grid">
        {/* the label names its input alone; the «?» sits beside it, outside it (components/aiuto) */}
        {FIELDS.map(([name, max, required]) => (
          <div key={name} className={`field${name === 'name' ? ' span-2' : ''}`}>
            <Etichetta htmlFor={`${uid}-${name}`} className="field-label" aiuto={testoAiuto(AIUTO, name)} nome={t(`field_${name}`)}>
              {t(`field_${name}`)}{required ? ' *' : ''}<DalRilievo id={name} value={v[name]} />
            </Etichetta>
            <input id={`${uid}-${name}`} className="input" name={name} value={v[name]} onChange={(e) => put(name, e.target.value)} maxLength={max} required={required}
              aria-invalid={bad.has(name) || undefined} />
          </div>
        ))}
        <div className="field span-2">
          <Etichetta htmlFor={`${uid}-notes`} className="field-label" aiuto={testoAiuto(AIUTO, 'notes')} nome={t('field_notes')}>{t('field_notes')}</Etichetta>
          <textarea id={`${uid}-notes`} className="input" name="notes" value={v.notes} onChange={(e) => put('notes', e.target.value)} maxLength={4000} />
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>{initial?.id ? t('save') : t('create')}</button>
      </div>
    </form>
    </OrigineProvider>
  );
}
