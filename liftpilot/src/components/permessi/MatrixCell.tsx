'use client';

import type { Role } from '@prisma/client';
import type { MatrixCapability } from '@/lib/rbac';

export type CellLock = 'owner' | 'never' | 'chiefOnly' | null;

/** A box of the rights matrix, drawn as a key of a controller's panel: lit when the right is granted, with a lock when
 *  the hard rules fix it (the owner's column, the rights never given, the Capotecnico's only), a mark when the company
 *  differs from the default, a ring while the change is not saved. A real checkbox under the drawing: the keyboard, the
 *  screen reader and a click on the whole cell work as on any box. */
export default function MatrixCell({ role, capability, label, on, lock, reason, custom, unsaved, hidden, busy, onToggle }: {
  role: Role;
  capability: MatrixCapability;
  /** the role and the right, read by assistive technology */
  label: string;
  on: boolean;
  lock: CellLock;
  /** why the box does not move (the lock's rule, or the prerequisite to grant first), shown on hover */
  reason?: string;
  /** different from the default matrix */
  custom: boolean;
  /** different from what is saved */
  unsaved: boolean;
  /** on a phone, only the role chosen above the matrix is shown */
  hidden: boolean;
  busy: boolean;
  onToggle: (on: boolean) => void;
}) {
  const cls = ['pm-cell', on ? 'is-on' : 'is-off', lock ? `is-locked lock-${lock}` : '', custom ? 'is-custom' : '', unsaved ? 'is-unsaved' : '', hidden ? 'pm-off' : '']
    .filter(Boolean).join(' ');
  return (
    <td className={cls} data-role={role} data-cap={capability}>
      <label className="pm-key" title={reason}>
        <input type="checkbox" checked={on} disabled={lock !== null || busy} aria-label={label}
          aria-describedby={lock ? `pm-lock-${lock}` : undefined} onChange={(e) => onToggle(e.currentTarget.checked)} />
        <span className="pm-key-face" aria-hidden="true">
          {lock ? (
            <svg viewBox="0 0 16 16" className="pm-glyph"><path d="M5 7V5a3 3 0 0 1 6 0v2M4 7h8v6H4z" /></svg>
          ) : on ? (
            <svg viewBox="0 0 16 16" className="pm-glyph"><path d="M3.5 8.5l3 3 6-7" /></svg>
          ) : null}
        </span>
      </label>
    </td>
  );
}
