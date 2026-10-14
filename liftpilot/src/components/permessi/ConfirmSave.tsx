'use client';

import type { RefObject } from 'react';
import { useTranslations } from 'next-intl';
import type { PermissionChange } from '@/lib/permissions';

/** The question before a save (a native modal dialog: the focus stays in it, Esc closes it): how many rights change and
 *  each one, role by role, before → after. */
export default function ConfirmSave({ dialogRef, changes, busy, onConfirm }: {
  dialogRef: RefObject<HTMLDialogElement | null>; changes: PermissionChange[]; busy: boolean; onConfirm: () => void;
}) {
  const t = useTranslations('permessi'), tr = useTranslations('roles');
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
      <div className="pm-dialog-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onConfirm}>{t('confirm')}</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => dialogRef.current?.close()}>{t('cancel')}</button>
      </div>
    </dialog>
  );
}
