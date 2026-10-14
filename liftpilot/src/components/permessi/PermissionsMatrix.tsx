'use client';

// The company's rights matrix (round 42): the actions in their groups down the side, the roles across — the owner's
// column always granted and locked, a colleague role's boxes set by the owner (or the platform) within the hard rules of
// src/lib/rbac.ts, each rule written under the action it locks. Ticking a right brings what it stands on, clearing one
// takes away what stands on it (src/lib/permissions.ts toggle), and a line says which others moved with it. Each group
// names the roles again over its boxes. Nothing is saved until «Salva i permessi» and the dialog's confirmation; the
// outcome takes the focus; a save on a matrix someone changed meanwhile is refused and the page shows the matrix in
// force. On a phone one role at a time, chosen above the matrix.
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { Role } from '@prisma/client';
import { useRouter } from '@/i18n/routing';
import { DEFAULT_GRANTS, REQUIRES, lockOf, type MatrixCapability, type MemberRole } from '@/lib/rbac';
import { MATRIX_ROLES, PERMISSION_GROUPS, columnChanges, defaultColumn, toggle, type Grants } from '@/lib/permissions';
import { savePermissionsAction } from '@/server/permission-actions';
import ConfirmSave from './ConfirmSave';
import MatrixCell, { type CellLock } from './MatrixCell';

const COLUMNS: readonly Role[] = ['OWNER', ...MATRIX_ROLES];
const LOCKS = ['owner', 'never', 'chiefOnly'] as const;
const LEGEND = {
  on: 'legendOn', always: 'legendAlways', off: 'legendOff', locked: 'legendLocked', custom: 'legendCustom', unsaved: 'legendUnsaved',
} as const;
const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));
const isMember = (r: Role): r is MemberRole => r !== 'OWNER' && r !== 'SUPERADMIN';
/** The rule a row's locked boxes follow, written under the action: no colleague has it, or only the Capotecnico. */
const rowRule = (c: MatrixCapability): 'never' | 'chiefOnly' | null =>
  MATRIX_ROLES.every((r) => lockOf(r, c) === 'never') ? 'never' : MATRIX_ROLES.some((r) => lockOf(r, c) === 'chiefOnly') ? 'chiefOnly' : null;

export default function PermissionsMatrix({ companyId, stamp: savedStamp, grants }: { companyId: string; stamp: string; grants: Grants }) {
  const t = useTranslations('permessi'), tr = useTranslations('roles'), router = useRouter();
  const [seen, setSeen] = useState(savedStamp);
  const [base, setBase] = useState(grants), [cur, setCur] = useState(grants), [stamp, setStamp] = useState(savedStamp);
  // the matrix in force came again from the server (after a refused save): it replaces what is on the screen
  if (savedStamp !== seen) {
    setSeen(savedStamp);
    setBase(grants);
    setCur(grants);
    setStamp(savedStamp);
  }
  const [show, setShow] = useState<Role>('CHIEF_TECHNICIAN');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // the rights that moved with the last box (its prerequisites, or what stands on it)
  const [cascade, setCascade] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null), status = useRef<HTMLParagraphElement>(null);
  const changes = useMemo(() => columnChanges(base, cur), [base, cur]);
  const dirty = changes.length > 0;

  // leaving with unsaved changes: the browser asks first
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);
  // the outcome of a save takes the focus: the save button it came from is disabled once nothing waits
  useEffect(() => {
    if (msg) status.current?.focus();
  }, [msg]);

  const set = (role: MemberRole, capability: MatrixCapability, on: boolean) => {
    setMsg(null);
    const next = toggle(cur[role], role, capability, on);
    const moved = (on ? next.filter((c) => !cur[role].includes(c)) : cur[role].filter((c) => !next.includes(c))).filter((c) => c !== capability);
    setCascade(moved.length
      ? t(on ? 'cascadeOn' : 'cascadeOff', { role: tr(role), rights: moved.map((c) => t(`caps.${c}`)).join(', ') }) : null);
    setCur((g) => ({ ...g, [role]: next }));
  };
  const reset = (role: MemberRole) => {
    setMsg(null);
    setCascade(null);
    setCur((g) => ({ ...g, [role]: defaultColumn(role) }));
  };
  const save = () => start(async () => {
    const r = await savePermissionsAction({ companyId, stamp, grants: cur });
    dialog.current?.close();
    setCascade(null);
    if (r.ok) {
      setBase(cur);
      setStamp(r.stamp);
      setMsg({ ok: true, text: t('saved', { n: r.changed }) });
      return;
    }
    setMsg({ ok: false, text: t(`errors.${r.error}`) });
    if (r.error === 'conflict') router.refresh();
  });

  const lockText = (lock: CellLock): string | undefined => (lock ? t(`locks.${lock}`) : undefined);
  const needs = (c: MatrixCapability): string | null => {
    const req = REQUIRES[c];
    return req ? t('requires', { rights: req.map((r) => t(`short.${r}` as 'short.projects:view')).join(', ') }) : null;
  };

  return (
    <div className="pm">
      {LOCKS.map((l) => <span key={l} id={`pm-lock-${l}`} className="sr-only">{t(`locks.${l}`)}</span>)}
      <div className="pm-pick" role="group" aria-label={t('showRole')}>
        <div className="seg-row">
          {COLUMNS.map((r) => (
            <button key={r} type="button" className={show === r ? 'on' : undefined} aria-pressed={show === r} onClick={() => setShow(r)}>{tr(r)}</button>
          ))}
        </div>
      </div>
      <div className="table-panel pm-panel">
        <table className="pm-table">
          <caption className="sr-only">{t('matrix')}</caption>
          <thead>
            <tr>
              <th scope="col" className="pm-action">{t('action')}</th>
              {COLUMNS.map((r) => {
                const member = isMember(r), atDefault = member && sameSet(cur[r], defaultColumn(r));
                const differs = member ? columnChanges({ ...cur, [r]: defaultColumn(r) }, cur).length : 0;
                return (
                  <th key={r} scope="col" data-role={r} className={`pm-role${r === 'OWNER' ? ' pm-owner' : ''}${show === r ? '' : ' pm-off'}`}>
                    <span className="pm-role-name">{tr(r)}</span>
                    <span className="pm-role-note">{member ? (differs ? t('roleChanged', { n: differs }) : t('default')) : t('ownerAll')}</span>
                    {member ? (
                      <button type="button" className="btn btn-sm btn-ghost pm-reset" disabled={atDefault || busy} onClick={() => reset(r)}
                        aria-label={`${t('reset')} — ${tr(r)}`}>{t('reset')}</button>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          {PERMISSION_GROUPS.map((g) => (
            <tbody key={g.key}>
              <tr className="pm-group">
                <th scope="rowgroup">{t(`groups.${g.key}`)}</th>
                {/* the roles named again over the group's boxes (the head is far up on a long matrix) */}
                {COLUMNS.map((r) => (
                  <td key={r} aria-hidden="true" className={`pm-group-role${r === 'OWNER' ? ' pm-owner' : ''}${show === r ? '' : ' pm-off'}`}>{tr(r)}</td>
                ))}
              </tr>
              {g.rows.map((c) => {
                const rule = rowRule(c);
                return (
                  <tr key={c}>
                    <th scope="row" className="pm-action">
                      <span className="pm-right">{t(`caps.${c}`)}</span>
                      {needs(c) ? <span className="pm-needs">{needs(c)}</span> : null}
                      {rule ? <span className="pm-needs pm-rule">{t(`locks.${rule}`)}</span> : null}
                    </th>
                    {COLUMNS.map((r) => {
                      const lock = lockOf(r, c) as CellLock, member = isMember(r);
                      const on = member ? cur[r].includes(c) : true;
                      return (
                        <MatrixCell key={r} role={r} capability={c} label={`${tr(r)}: ${t(`caps.${c}`)}`} on={on} lock={lock} reason={lockText(lock)}
                          custom={member && on !== DEFAULT_GRANTS[c].includes(r)} unsaved={member && on !== base[r].includes(c)}
                          hidden={show !== r} busy={busy} onToggle={(v) => { if (member) set(r, c, v); }} />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      <p className="pm-legend note">
        {(Object.keys(LEGEND) as (keyof typeof LEGEND)[]).map((k) => (
          <span key={k} className="pm-leg"><span className={`pm-chip ${k}`} aria-hidden="true" />{t(LEGEND[k])}</span>
        ))}
      </p>
      <div className="savebar pm-savebar">
        <div className="inner">
          <div className="pm-status">
            {msg ? <p ref={status} tabIndex={-1} className={`pm-msg ${msg.ok ? 'ok' : 'bad'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>
              : <p className="pm-msg" role="status">{dirty ? t('pending', { n: changes.length }) : t('none')}</p>}
            <p className="pm-cascade" role="status">{cascade}</p>
          </div>
          <div className="pm-actions">
            <button type="button" className="btn btn-ghost" disabled={!dirty || busy} onClick={() => { setMsg(null); setCascade(null); setCur(base); }}>{t('discard')}</button>
            <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={() => dialog.current?.showModal()}>{t('save')}</button>
          </div>
        </div>
      </div>
      <ConfirmSave dialogRef={dialog} changes={changes} busy={busy} onConfirm={save} />
    </div>
  );
}
