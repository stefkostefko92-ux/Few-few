'use client';

// The top of a form that «Aggiorna con il software attuale» opened because the record no longer saves as it was entered
// (src/server/refresh-actions.ts, ?aggiorna=1): what happened, what is left to correct — each value a link to its field,
// as the form finds it now — and that the save makes a new record, the old one staying as it was.
import { useTranslations } from 'next-intl';
import { goToField } from './MissingPanel';

export interface NoticeItem {
  /** the field's id; null: none to go to */
  id: string | null;
  label: string;
}

/** `kind`: the record's (a lift design, a calculation, a machine room survey); `items`: what is left to correct, as the
 *  form has it (null: the form marks it itself). */
export default function RefreshNotice({ kind, items = null }: { kind: 'lift' | 'calc' | 'room'; items?: readonly NoticeItem[] | null }) {
  const t = useTranslations('refresh');
  const done = items !== null && items.length === 0;
  return (
    <section className={`alert ${done ? 'alert-ok' : 'alert-warn'} refresh-notice`} role="status" aria-labelledby="refresh-notice-title">
      <h2 id="refresh-notice-title" className="m-0 text-base">{t('formTitle')}</h2>
      <p className="m-0">{t(`form_${kind}`)}</p>
      {items && items.length ? (
        <>
          <p className="m-0">{t('formFix')}</p>
          <ul className="missing-list">
            {items.map((i) => (
              <li key={`${i.id ?? ''}${i.label}`}>{i.id ? <a href={`#${i.id}`} onClick={(e) => { e.preventDefault(); if (i.id) goToField(i.id); }}>{i.label}</a> : i.label}</li>
            ))}
          </ul>
        </>
      ) : null}
      {done ? <p className="m-0">{t('formDone')}</p> : null}
    </section>
  );
}
