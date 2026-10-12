// Конзолата за единния вход (OIDC / Microsoft Entra ID; §12.4 „MFA federata e policy“, §14.4):
// доставчик за вътрешните и по избор за фирма от портала, домейни (доказване през DNS TXT), режим
// (по избор/задължително), доверие в MFA на доставчика, проверка и тест (включва се само след
// успешен тест). Секретът никога не се показва (`hasSecret`).

import { t } from '../i18n.js';
import { call, can, fmtDateTime } from './core.js';
import { removeConfig, runCheck, showIdentities, startTest } from './sso-actions.js';
import { copyField, domainsBlock } from './sso-domains.js';
import { openConfigForm, scopeLabel } from './sso-form.js';
import { badge, button, emptyState, failure, h, loading, sectionHead, toast } from './ui.js';

const REPORT_FLAGS = ['emailVerified', 'domainAllowed', 'amrPresent', 'mfa'];

function fact(label, value) {
  return [h('dt', {}, label), h('dd', {}, value || '—')];
}

function lastTest(cfg) {
  if (!cfg.lastTestAt) return t('admin.sso.lastTestNever');
  const when = fmtDateTime(cfg.lastTestAt);
  return t(cfg.lastTestOk ? 'admin.sso.lastTestOk' : 'admin.sso.lastTestFailed', { when });
}

function report(cfg) {
  const r = cfg.lastTestReport;
  if (!r || typeof r !== 'object') return null;
  const items = REPORT_FLAGS.map((f) =>
    h(
      'li',
      {},
      h('span', { 'aria-hidden': 'true' }, r[f] ? '✓ ' : '– '),
      t(`admin.sso.report.${f}`),
      ': ',
      t(r[f] ? 'admin.sso.yes' : 'admin.sso.no'),
    ),
  );
  if (r.failure) items.push(h('li', {}, t(`admin.sso.failure.${r.failure}`)));
  return h('ul', { class: 'plain' }, ...items);
}

function card(cfg, reload, ctx) {
  const titleId = `sso-${cfg.id}`;
  const badges = h(
    'p',
    { class: 'chips' },
    badge(cfg.enabled ? 'ok' : 'idle', t(cfg.enabled ? 'admin.sso.on' : 'admin.sso.off')),
    ' ',
    badge(cfg.mode === 'REQUIRED' ? 'warn' : 'info', t(`admin.sso.mode.${cfg.mode}`)),
    cfg.trustIdpMfa ? [' ', badge('info', t('admin.sso.mfaTrusted'))] : null,
  );
  const provider =
    cfg.provider === 'OIDC' && cfg.displayName
      ? `${t('admin.sso.provider.OIDC')} — ${cfg.displayName}`
      : t(`admin.sso.provider.${cfg.provider}`);
  return h(
    'section',
    { class: 'fieldset', 'aria-labelledby': titleId },
    h('h2', { id: titleId }, scopeLabel(cfg)),
    badges,
    h(
      'dl',
      { class: 'facts' },
      ...fact(t('admin.sso.f.provider'), provider),
      ...(cfg.provider === 'ENTRA'
        ? fact(t('admin.sso.f.tenantId'), cfg.entraTenantId)
        : fact(t('admin.sso.f.issuer'), cfg.issuer)),
      ...fact(t('admin.sso.f.clientId'), cfg.clientId),
      ...fact(t('admin.sso.secretUpdated'), fmtDateTime(cfg.secretUpdatedAt)),
      ...fact(t('admin.sso.linked'), String(cfg.linkedUsers)),
      ...fact(t('admin.sso.lastTest'), lastTest(cfg)),
    ),
    report(cfg),
    domainsBlock(cfg, reload),
    h(
      'div',
      { class: 'btn-row' },
      button(t('admin.sso.edit'), () => openConfigForm(cfg, ctx, reload), { kind: 'primary' }),
      button(t('admin.sso.check.action'), () => runCheck(cfg)),
      button(t('admin.sso.test.action'), () => startTest(cfg)),
      button(t('admin.sso.users.action'), () => showIdentities(cfg, reload)),
      button(t('admin.sso.delete.title'), () => removeConfig(cfg, reload), { kind: 'danger' }),
    ),
  );
}

async function companies() {
  if (!can('users:manage')) return [];
  try {
    return (await call('GET', '/admin/companies')).companies ?? [];
  } catch {
    return [];
  }
}

function content(data, list, reload) {
  const ctx = {
    companies: list,
    taken: new Set(data.configs.map((c) => c.companyId ?? 'internal')),
  };
  const add = data.available
    ? button(t('admin.sso.add'), () => openConfigForm(null, ctx, reload), { kind: 'primary' })
    : null;
  const parts = [
    sectionHead(t('admin.sso.title'), add),
    h('p', { class: 'muted' }, t('admin.sso.intro')),
  ];
  if (!data.available) {
    parts.push(emptyState(t('admin.sso.unavailable'), t('admin.sso.unavailableHint')));
  }
  parts.push(
    h(
      'section',
      { class: 'fieldset', 'aria-labelledby': 'sso-uris' },
      h('h2', { id: 'sso-uris' }, t('admin.sso.uris')),
      h('p', { class: 'hint' }, t('admin.sso.urisHint')),
      h(
        'dl',
        { class: 'facts' },
        ...copyField(t('admin.sso.redirectUri'), data.redirectUri),
        ...copyField(t('admin.sso.logoutUri'), data.postLogoutRedirectUri),
      ),
    ),
  );
  if (data.configs.length === 0) {
    parts.push(emptyState(t('admin.sso.empty'), t('admin.sso.emptyHint')));
  } else {
    for (const cfg of data.configs) parts.push(card(cfg, reload, ctx));
  }
  return parts;
}

export async function mount(view, params) {
  // Връщането от интерактивния тест: `#sso?test=ok|failed` — съобщение веднъж, после чист адрес.
  const test = params.get('test');
  if (test) {
    toast(
      t(test === 'ok' ? 'admin.sso.test.ok' : 'admin.sso.test.failed'),
      test === 'ok' ? 'ok' : 'err',
    );
    history.replaceState(null, '', '#sso');
  }
  const render = async () => {
    view.replaceChildren(sectionHead(t('admin.sso.title')), loading());
    try {
      const [data, list] = await Promise.all([call('GET', '/admin/sso'), companies()]);
      view.replaceChildren(...content(data, list, render));
    } catch (err) {
      view.replaceChildren(sectionHead(t('admin.sso.title')), failure(err, render));
    }
  };
  await render();
  return () => undefined;
}
