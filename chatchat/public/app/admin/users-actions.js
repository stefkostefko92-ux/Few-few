// Действията върху един акаунт (FR-22/25, AC-16): промяна, нов линк за парола, отнемане на сесии,
// нулиране на MFA, експорт и изтриване (GDPR). Всяко промяна иска причина — тя отива в одита.

import { t } from '../i18n.js';
import {
  ApiError,
  call,
  downloadJson,
  endOfDayIso,
  fmtDate,
  fmtDateTime,
  toDateInput,
} from './core.js';
import {
  button,
  checkbox,
  confirmDialog,
  dialog,
  errText,
  field,
  h,
  input,
  select,
  toast,
} from './ui.js';
import {
  companyOptions,
  definitionList,
  loadCompanies,
  permissionsFor,
  reasonField,
  roleLabel,
  roleOptions,
  assignableRoles,
  showSecretLink,
} from './users-common.js';

/** Картата на акаунта: данните + само действията, които са смислени за влезлия. */
export function openUser(user, ctx) {
  const perm = permissionsFor(user);
  const act = (fn) => () => {
    d.close();
    fn(user, ctx);
  };
  const actions = h('div', { class: 'btn-col' });
  if (perm.edit) actions.append(button(t('admin.users.act.edit'), act(editUser)));
  if (perm.link) actions.append(button(t('admin.users.act.link'), act(newLink)));
  if (perm.revoke) actions.append(button(t('admin.users.act.revoke'), act(revokeSessions)));
  if (perm.resetMfa && user.mfaEnabled) {
    actions.append(button(t('admin.users.act.resetMfa'), act(resetMfa)));
  }
  if (perm.export) actions.append(button(t('admin.users.act.export'), act(exportData)));
  if (perm.erase)
    actions.append(button(t('admin.users.act.erase'), act(eraseUser), { kind: 'danger' }));

  const why = perm.erased
    ? t('admin.users.note.erased')
    : perm.higher
      ? t('admin.users.note.higher')
      : perm.self
        ? t('admin.users.note.self')
        : '';
  const d = dialog({
    title: user.name,
    cancel: false,
    closeLabel: t('common.close'),
    wide: true,
    body: [
      definitionList([
        [t('admin.users.col.email'), h('span', { class: 'mono' }, user.email)],
        [t('admin.users.col.role'), roleLabel(user.role)],
        [t('admin.users.col.kind'), t(`admin.kind.${user.kind}`)],
        [t('admin.users.col.company'), user.company?.name ?? ''],
        [t('admin.users.col.mfa'), user.mfaEnabled ? t('admin.on') : t('admin.off')],
        [t('admin.users.col.status'), user.active ? t('admin.active') : t('admin.inactive')],
        [t('admin.users.col.expires'), fmtDate(user.expiresAt)],
        [t('admin.users.col.lastLogin'), fmtDateTime(user.lastLoginAt)],
      ]),
      why ? h('p', { class: 'note' }, why) : null,
      actions.children.length ? h('h3', { class: 'sub' }, t('admin.users.actions')) : null,
      actions,
    ],
    actions: [],
  });
  return d;
}

// ── Промяна (PATCH /users/:id/admin) ─────────────────────────────────────────────────────────

async function editUser(user, ctx) {
  let companies = [];
  try {
    companies = await loadCompanies();
  } catch (err) {
    toast(errText(err), 'err');
    return;
  }
  const role = select(roleOptions(assignableRoles()), user.role);
  const active = checkbox(t('admin.users.f.activeAccount'), { checked: user.active || undefined });
  const expires = input({ type: 'date', value: toDateInput(user.expiresAt) });
  const company = select(companyOptions(companies), user.company?.id ?? '');
  const reason = reasonField();
  dialog({
    title: t('admin.users.edit.title', { name: user.name }),
    body: [
      field(t('admin.users.col.role'), role),
      field(t('admin.users.col.company'), company),
      field(t('admin.users.col.expires'), expires, { hint: t('admin.users.expires.hint') }),
      active,
      h('p', { class: 'hint' }, t('admin.users.edit.signout')),
      reason.node,
    ],
    actions: [
      {
        label: t('admin.save'),
        primary: true,
        onClick: async () => {
          const body = { reason: reason.value() };
          if (role.value !== user.role) body.role = role.value;
          const isActive = active.querySelector('input').checked;
          if (isActive !== user.active) body.active = isActive;
          if (company.value !== (user.company?.id ?? '')) body.companyId = company.value || null;
          if (expires.value !== toDateInput(user.expiresAt)) {
            body.expiresAt = expires.value ? endOfDayIso(expires.value) : null;
          }
          if (Object.keys(body).length === 1) throw new ApiError(400, 'no_changes');
          const res = await call('PATCH', `/users/${user.id}/admin`, body);
          toast(
            res.revokedSessions
              ? t('admin.users.saved.revoked', { count: res.revokedSessions })
              : t('admin.users.saved'),
          );
          ctx.reload();
        },
      },
    ],
  });
}

// ── Нов линк за парола ───────────────────────────────────────────────────────────────────────

function newLink(user) {
  const reason = reasonField({ required: false });
  dialog({
    title: t('admin.users.link.title', { name: user.name }),
    body: [h('p', {}, t('admin.users.link.text')), reason.node],
    actions: [
      {
        label: t('admin.users.link.create'),
        primary: true,
        onClick: async () => {
          const res = await call(
            'POST',
            `/admin/users/${user.id}/reset-password`,
            reason.value() ? { reason: reason.value() } : {},
          );
          showSecretLink({
            title: t('admin.users.link.ready'),
            url: res.url,
            expiresAt: res.expiresAt,
          });
        },
      },
    ],
  });
}

// ── Отнемане на сесии / нулиране на MFA ──────────────────────────────────────────────────────

function revokeSessions(user) {
  const reason = reasonField();
  dialog({
    title: t('admin.users.revoke.title', { name: user.name }),
    body: [h('p', {}, t('admin.users.revoke.text')), reason.node],
    actions: [
      {
        label: t('admin.users.act.revoke'),
        primary: true,
        onClick: async () => {
          const res = await call('POST', `/admin/users/${user.id}/revoke-sessions`, {
            reason: reason.value(),
          });
          toast(t('admin.users.revoke.done', { count: res.revoked }));
        },
      },
    ],
  });
}

function resetMfa(user, ctx) {
  const reason = reasonField();
  dialog({
    title: t('admin.users.mfa.title', { name: user.name }),
    body: [h('p', {}, t('admin.users.mfa.text')), reason.node],
    actions: [
      {
        label: t('admin.users.act.resetMfa'),
        primary: true,
        danger: true,
        onClick: async () => {
          const res = await call('POST', `/admin/users/${user.id}/reset-mfa`, {
            reason: reason.value(),
          });
          toast(t('admin.users.mfa.done', { count: res.revoked }));
          ctx.reload();
        },
      },
    ],
  });
}

// ── Права на субекта: експорт и изтриване ────────────────────────────────────────────────────

async function exportData(user) {
  const ok = await confirmDialog({
    title: t('admin.users.export.title', { name: user.name }),
    message: t('admin.users.export.text'),
    confirmLabel: t('admin.users.export.go'),
  });
  if (!ok) return;
  try {
    await downloadJson(`/admin/users/${user.id}/export`, `chatchat-export-${user.id}.json`);
    toast(t('admin.users.export.done'));
  } catch (err) {
    toast(errText(err), 'err');
  }
}

/** Анонимизация: необратима; затова причина + съзнателно потвърждение + въвеждане на имейла. */
function eraseUser(user, ctx) {
  const reason = reasonField();
  const understand = checkbox(t('admin.users.erase.understand'), { required: true });
  const typed = input({ autocapitalize: 'off', spellcheck: 'false', 'aria-required': 'true' });
  typed.addEventListener('input', () => {
    typed.setCustomValidity(
      typed.value.trim().toLowerCase() === user.email.toLowerCase()
        ? ''
        : t('admin.users.erase.mismatch'),
    );
  });
  typed.setCustomValidity(t('admin.users.erase.mismatch'));
  dialog({
    title: t('admin.users.erase.title', { name: user.name }),
    body: [
      h('p', { class: 'note note-stop' }, t('admin.users.erase.text')),
      reason.node,
      understand,
      field(t('admin.users.erase.type', { email: user.email }), typed),
    ],
    actions: [
      {
        label: t('admin.users.act.erase'),
        primary: true,
        danger: true,
        onClick: async () => {
          await call('POST', `/admin/users/${user.id}/erase`, { reason: reason.value() });
          toast(t('admin.users.erase.done'));
          ctx.reload();
        },
      },
    ],
  });
}
