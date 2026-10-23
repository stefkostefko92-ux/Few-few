'use client';

import type { RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { REQUEST_MIN, type PermissionChange } from '@/lib/permissions';

/** The question before a save (a native modal dialog: the focus stays in it, Esc closes it): how many rights change and
 *  each one, role by role, before → after. From the platform (`request`), also the reference of the owner's written
 *  request, without which the save stays disabled (the server refuses it too). */
export default function ConfirmSave({ dialogRef, changes, busy, onConfirm, request }: {
  dialogRef: RefObject<HTMLDialogElement | null>; changes: PermissionChange[]; busy: boolean; onConfirm: () => void;
  request: { value: string; set: (v: string) => void } | null;
}) {
  const t = useTranslations('permessi'), tr = useTranslations('roles');
  const missing = request !== null && request.value.trim().length < REQUEST_MIN;
  return (
    <dialog ref={dialogRef} className="pm-dialog" aria-labelledby="pm-confirm-title" aria-describedby="pm-confirm-text">
      <h2 id="pm-confirm-title">{t('confirmTitle')}</h2>
      <p id="pm-confirm-text" className="note">{t('confirmText', { n: changes.length })}</p>
      <ul className="pm-changes" aria-label={t('changesTitle')}>
        {changes.map((c) => (
          <li key={`${c.role}|${c.capability}`}>
            <span className="pm-change-role">{tr(c.role)}</span>
            <span className="pm-change-right">{t(`caps.${c.capability}`)}</span>
            <span className={`pm-change-to ${c.to ? 'on' : 'off'}`}>{t(c.from ? 'on' : 'off')} → {t(c.to ? 'on' : 'off')}</span>
          </li>
        ))}
      </ul>
      {request ? (
        <div className="field pm-request">
          <label htmlFor="pm-request" className="field-label">{t('requestLabel')}</label>
          <input id="pm-request" className="input" name="request" type="text" required maxLength={200} autoComplete="off" value={request.value}
            aria-describedby="pm-request-hint" onChange={(e) => request.set(e.target.value)} />
          <span id="pm-request-hint" className="hint">{t('requestHint')}</span>
        </div>
      ) : null}
      <div className="pm-dialog-actions">
        <button type="button" className="btn btn-primary" disabled={busy || missing} onClick={onConfirm}>{t('confirm')}</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => dialogRef.current?.close()}>{t('cancel')}</button>
      </div>
    </dialog>
  );
}
