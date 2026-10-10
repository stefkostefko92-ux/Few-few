// Действията върху доставчик на единния вход: проверка на метаданните, интерактивен тест (води
// към доставчика и обратно в конзолата), свързаните акаунти (развързване) и изтриване.

import { t } from '../i18n.js';
import { call, fmtDateTime } from './core.js';
import { ssoErr } from './sso-form.js';
import { button, confirmDialog, dataTable, dialog, emptyState, h, loading, toast } from './ui.js';

const mark = (ok) => h('span', { 'aria-hidden': 'true' }, ok ? '✓ ' : '✗ ');

function checkLine(label, ok, note) {
  return h(
    'li',
    {},
    mark(ok),
    label,
    ': ',
    t(ok ? 'admin.sso.yes' : 'admin.sso.no'),
    note ? ` — ${note}` : '',
  );
}

export async function runCheck(cfg) {
  const list = h('ul', { class: 'plain' }, loading(t('admin.sso.check.running')));
  const dlg = dialog({ title: t('admin.sso.check.title'), body: list, cancel: false });
  try {
    const { check } = await call('POST', `/admin/sso/configs/${encodeURIComponent(cfg.id)}/check`);
    list.replaceChildren(
      h('li', {}, mark(check.ok), t(check.ok ? 'admin.sso.check.ok' : 'admin.sso.check.failed')),
      checkLine(t('admin.sso.check.discovery'), check.discovery),
      checkLine(t('admin.sso.check.endpoints'), check.endpoints),
      checkLine(t('admin.sso.check.jwks'), check.jwks),
      checkLine(
        t('admin.sso.check.pkce'),
        check.pkceS256 !== false,
        check.pkceS256 === null ? t('admin.sso.check.pkceUnknown') : '',
      ),
      checkLine(t('admin.sso.check.endSession'), check.endSession),
    );
  } catch (err) {
    dlg.setError(ssoErr(err));
    list.replaceChildren();
  }
}

export async function startTest(cfg) {
  try {
    const { url } = await call('POST', `/admin/sso/configs/${encodeURIComponent(cfg.id)}/test`);
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) location.assign(url);
  } catch (err) {
    toast(ssoErr(err), 'err');
  }
}

export async function showIdentities(cfg, onChange) {
  const host = h('div', {}, loading());
  dialog({ title: t('admin.sso.users.title'), body: host, cancel: false, wide: true });
  const render = async () => {
    try {
      const { identities } = await call(
        'GET',
        `/admin/sso/configs/${encodeURIComponent(cfg.id)}/identities`,
      );
      if (!identities.length) {
        host.replaceChildren(
          emptyState(t('admin.sso.users.empty'), t('admin.sso.users.emptyHint')),
        );
        return;
      }
      host.replaceChildren(
        dataTable({
          caption: t('admin.sso.users.title'),
          rows: identities,
          columns: [
            { label: t('admin.sso.users.name'), render: (u) => u.name },
            { label: t('admin.sso.users.email'), render: (u) => u.email },
            { label: t('admin.sso.users.role'), render: (u) => t(`admin.role.${u.role}`) },
            { label: t('admin.sso.users.linkedAt'), render: (u) => fmtDateTime(u.linkedAt) },
            {
              label: t('admin.sso.users.method'),
              render: (u) =>
                t(u.linkMethod === 'SELF' ? 'admin.sso.users.bySelf' : 'admin.sso.users.byEmail'),
            },
            {
              label: t('admin.sso.users.actions'),
              cls: 'col-actions',
              render: (u) =>
                button(t('admin.sso.users.unlink'), () => unlink(u), {
                  small: true,
                  'aria-label': t('admin.sso.users.unlinkFor', { name: u.name }),
                }),
            },
          ],
        }),
      );
    } catch (err) {
      host.replaceChildren(h('p', { class: 'form-error', role: 'alert' }, ssoErr(err)));
    }
  };
  const unlink = async (u) => {
    const yes = await confirmDialog({
      title: t('admin.sso.users.unlink'),
      message: t('admin.sso.users.unlinkConfirm', { name: u.name }),
      confirmLabel: t('admin.sso.users.unlink'),
      danger: true,
    });
    if (!yes) return;
    try {
      await call('DELETE', `/admin/sso/identities/${encodeURIComponent(u.id)}`);
      toast(t('admin.sso.users.unlinked'));
      await render();
      await onChange();
    } catch (err) {
      toast(ssoErr(err), 'err');
    }
  };
  await render();
}

export async function removeConfig(cfg, onChange) {
  const yes = await confirmDialog({
    title: t('admin.sso.delete.title'),
    message: t('admin.sso.delete.confirm'),
    confirmLabel: t('admin.sso.delete.title'),
    danger: true,
  });
  if (!yes) return;
  try {
    await call('DELETE', `/admin/sso/configs/${encodeURIComponent(cfg.id)}`);
    toast(t('admin.sso.deleted'));
    await onChange();
  } catch (err) {
    toast(ssoErr(err), 'err');
  }
}
