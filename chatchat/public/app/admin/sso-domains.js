// Доказване на домейните на доставчик (DNS TXT): само доказан домейн показва бутона за вход,
// започва вход и свързва акаунти. За недоказан — записът за DNS (`_chatchat.<домейн>` =
// `chatchat-verify=<токен>`; токенът не е тайна — отива в публичния DNS) и „Verifica“.

import { t } from '../i18n.js';
import { call, fmtDateTime } from './core.js';
import { ssoErr } from './sso-form.js';
import { badge, button, h, input, toast } from './ui.js';

/** Поле само за четене с бутон „Копирай“ — за `dl.facts` (dt + dd). */
export function copyField(label, value) {
  const box = input({ value, readonly: true, class: 'mono', 'aria-label': label });
  const copy = button(t('admin.copy'), async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast(t('admin.copied'));
    } catch {
      box.focus();
      box.select();
    }
  });
  return [h('dt', {}, label), h('dd', {}, h('div', { class: 'inline' }, box, copy))];
}

async function verify(cfg, domain, reload) {
  try {
    await call(
      'POST',
      `/admin/sso/configs/${encodeURIComponent(cfg.id)}/domains/${encodeURIComponent(domain)}/verify`,
    );
    toast(t('admin.sso.domains.done', { domain }));
    await reload();
  } catch (err) {
    toast(ssoErr(err), 'err');
  }
}

function item(cfg, row, reload) {
  const name = h('span', { class: 'mono' }, row.domain);
  if (row.verifiedAt) {
    return h(
      'li',
      {},
      badge('ok', t('admin.sso.domains.verified')),
      ' ',
      name,
      ' — ',
      t('admin.sso.domains.verifiedAt', { when: fmtDateTime(row.verifiedAt) }),
    );
  }
  return h(
    'li',
    {},
    badge('warn', t('admin.sso.domains.pending')),
    ' ',
    name,
    row.txt
      ? h(
          'dl',
          { class: 'facts' },
          ...copyField(t('admin.sso.domains.txtHost', { domain: row.domain }), row.txt.host),
          ...copyField(t('admin.sso.domains.txtValue', { domain: row.domain }), row.txt.value),
        )
      : null,
    button(t('admin.sso.domains.verify'), () => verify(cfg, row.domain, reload), {
      small: true,
      'aria-label': t('admin.sso.domains.verifyFor', { domain: row.domain }),
    }),
  );
}

/** Домейните на доставчика със статуса на доказването. */
export function domainsBlock(cfg, reload) {
  const titleId = `sso-dom-${cfg.id}`;
  const rows = Array.isArray(cfg.domainStatus) ? cfg.domainStatus : [];
  return h(
    'section',
    { 'aria-labelledby': titleId },
    h('h3', { id: titleId }, t('admin.sso.domains.title')),
    rows.some((r) => !r.verifiedAt) ? h('p', { class: 'hint' }, t('admin.sso.domains.hint')) : null,
    h('ul', { class: 'plain' }, ...rows.map((r) => item(cfg, r, reload))),
  );
}
