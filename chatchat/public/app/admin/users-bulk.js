// Масови действия (§12.4): първо преглед на броя (dryRun), после потвърждение с точното число.

import { t } from '../i18n.js';
import { call, endOfDayIso, todayInput } from './core.js';
import { dialog, field, h, input, lock, select, toast } from './ui.js';
import { reasonField } from './users-common.js';

const ACTIONS = ['deactivate', 'activate', 'revoke_sessions', 'set_expiry'];

export function bulkDialog(ids, ctx) {
  const action = select(
    ACTIONS.map((a) => ({ value: a, label: t(`admin.bulk.${a}`) })),
    'deactivate',
  );
  const expires = input({ type: 'date', min: todayInput() });
  const expiresField = field(t('admin.bulk.expiresOn'), expires, {
    hint: t('admin.bulk.expiresHint'),
  });
  const reason = reasonField();
  const result = h('div', { class: 'bulk-result', role: 'status', 'aria-live': 'polite' });
  let applyBtn = null;
  let previewed = null; // { affected } за текущите входни данни

  const payload = (dryRun) => ({
    ids,
    action: action.value,
    reason: reason.value(),
    dryRun,
    ...(action.value === 'set_expiry'
      ? { expiresAt: expires.value ? endOfDayIso(expires.value) : null }
      : {}),
  });
  const invalidate = () => {
    previewed = null;
    result.replaceChildren();
    if (applyBtn) lock(applyBtn, true);
    expiresField.hidden = action.value !== 'set_expiry';
  };
  for (const el of [action, expires, reason.area]) {
    el.addEventListener('input', invalidate);
    el.addEventListener('change', invalidate);
  }

  const d = dialog({
    title: t('admin.bulk.title', { count: ids.length }),
    wide: true,
    body: [
      h('p', {}, t('admin.bulk.intro')),
      field(t('admin.bulk.action'), action),
      expiresField,
      reason.node,
      result,
    ],
    actions: [
      {
        label: t('admin.bulk.preview'),
        onClick: async () => {
          if (!d.form.reportValidity()) return false;
          const res = await call('POST', '/admin/users/bulk', payload(true));
          previewed = res;
          result.replaceChildren(
            h(
              'p',
              { class: 'bulk-count' },
              t('admin.bulk.willAffect', { affected: res.affected, requested: res.requested }),
            ),
            res.skipped > 0
              ? h('p', { class: 'hint' }, t('admin.bulk.skipped', { count: res.skipped }))
              : null,
          );
          if (applyBtn) lock(applyBtn, res.affected === 0);
          return false;
        },
      },
      {
        label: t('admin.bulk.apply'),
        danger: true,
        ref: (b) => {
          applyBtn = b;
          lock(b, true);
        },
        onClick: async () => {
          if (!previewed || !d.form.reportValidity()) return false;
          const res = await call('POST', '/admin/users/bulk', payload(false));
          toast(
            t('admin.bulk.done', { affected: res.affected, revoked: res.revokedSessions ?? 0 }),
          );
          ctx.clearSelection();
          ctx.reload();
        },
      },
    ],
  });
  invalidate();
  return d;
}
