// Форма за доставчик на единния вход (нов / промяна). Секретът само влиза: при промяна празно
// поле = „остава стария“. Entra ID иска само GUID на директорията (издателят се извежда); общ
// OIDC — адреса на издателя (само публичен HTTPS — сървърът проверява). REQUIRED се избира само
// при промяна (сървърът иска успешен тест и човек, влязъл през доставчика).

import { has, t } from '../i18n.js';
import { call } from './core.js';
import { checkbox, dialog, errText, field, h, input, select, textarea, toast } from './ui.js';

const GUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/** Преведената грешка на конзолата за единния вход (`admin.sso.err.*`), иначе общата. */
export function ssoErr(err) {
  const code = err?.code;
  return code && has(`admin.sso.err.${code}`) ? t(`admin.sso.err.${code}`) : errText(err);
}

export const scopeLabel = (cfg) =>
  cfg.companyId
    ? t('admin.sso.scope.company', { name: cfg.companyName ?? '—' })
    : t('admin.sso.scope.internal');

function boxOf(wrap) {
  return wrap.querySelector('input');
}

function domainsFrom(text) {
  return text
    .split(/[\s,;]+/)
    .map((d) => d.trim())
    .filter(Boolean);
}

/**
 * @param {object|null} cfg — null → нов доставчик
 * @param {{ companies: Array<{id: string, name: string}>, taken: Set<string> }} ctx
 * @param {() => Promise<void>} onSaved
 */
export function openConfigForm(cfg, ctx, onSaved) {
  const isNew = cfg === null;
  const scopes = [
    { value: '', label: t('admin.sso.scope.internal') },
    ...ctx.companies.map((c) => ({
      value: c.id,
      label: t('admin.sso.scope.company', { name: c.name }),
    })),
  ].filter((o) => !ctx.taken.has(o.value || 'internal'));
  const scope = select(scopes, scopes[0]?.value ?? '');
  const provider = select(
    ['ENTRA', 'OIDC'].map((p) => ({ value: p, label: t(`admin.sso.provider.${p}`) })),
    cfg?.provider ?? 'ENTRA',
  );
  const tenantId = input({
    value: cfg?.entraTenantId ?? '',
    pattern: GUID,
    spellcheck: 'false',
    class: 'mono',
    placeholder: '00000000-0000-0000-0000-000000000000',
  });
  const issuer = input({
    type: 'url',
    value: cfg?.provider === 'OIDC' ? cfg.issuer : '',
    spellcheck: 'false',
    placeholder: 'https://login.example.com/realms/azienda',
  });
  const displayName = input({ value: cfg?.displayName ?? '', maxlength: 60 });
  const clientId = input({ value: cfg?.clientId ?? '', required: true, spellcheck: 'false' });
  const secret = input({
    type: 'password',
    autocomplete: 'new-password',
    required: isNew,
    maxlength: 1000,
  });
  const domains = textarea({ rows: 2, required: true, spellcheck: 'false' });
  domains.value = (cfg?.domains ?? []).join('\n');
  const mode = select(
    ['OPTIONAL', 'REQUIRED'].map((m) => ({ value: m, label: t(`admin.sso.mode.${m}`) })),
    cfg?.mode ?? 'OPTIONAL',
  );
  const trust = checkbox(t('admin.sso.f.trustIdpMfa'), { checked: cfg?.trustIdpMfa ?? false });
  const logout = checkbox(t('admin.sso.f.idpLogout'), { checked: cfg?.idpLogout ?? false });
  const enabled = checkbox(t('admin.sso.f.enabled'), { checked: cfg?.enabled ?? true });

  const entraFields = h(
    'div',
    {},
    field(t('admin.sso.f.tenantId'), tenantId, { hint: t('admin.sso.f.tenantIdHint') }),
  );
  const oidcFields = h(
    'div',
    {},
    field(t('admin.sso.f.issuer'), issuer, { hint: t('admin.sso.f.issuerHint') }),
    field(t('admin.sso.f.displayName'), displayName, { hint: t('admin.sso.f.displayNameHint') }),
  );
  const sync = () => {
    const entra = provider.value === 'ENTRA';
    entraFields.hidden = !entra;
    oidcFields.hidden = entra;
    tenantId.required = entra;
    issuer.required = !entra;
  };
  provider.addEventListener('change', sync);
  provider.disabled = !isNew;
  sync();

  const body = h(
    'div',
    { class: 'fieldset' },
    isNew ? field(t('admin.sso.f.scope'), scope, { hint: t('admin.sso.f.scopeHint') }) : null,
    field(t('admin.sso.f.provider'), provider),
    entraFields,
    oidcFields,
    field(t('admin.sso.f.clientId'), clientId),
    field(t('admin.sso.f.clientSecret'), secret, {
      hint: t(isNew ? 'admin.sso.f.clientSecretHint' : 'admin.sso.f.clientSecretKeep'),
    }),
    field(t('admin.sso.f.domains'), domains, { hint: t('admin.sso.f.domainsHint'), wide: true }),
    isNew ? null : field(t('admin.sso.f.mode'), mode, { hint: t('admin.sso.f.modeHint') }),
    trust,
    h('p', { class: 'hint' }, t('admin.sso.f.trustIdpMfaHint')),
    logout,
    enabled,
  );

  const payload = () => {
    const entra = provider.value === 'ENTRA';
    const out = {
      clientId: clientId.value.trim(),
      domains: domainsFrom(domains.value),
      trustIdpMfa: boxOf(trust).checked,
      idpLogout: boxOf(logout).checked,
      enabled: boxOf(enabled).checked,
      ...(entra
        ? { entraTenantId: tenantId.value.trim() }
        : { issuer: issuer.value.trim(), displayName: displayName.value.trim() }),
    };
    if (secret.value) out.clientSecret = secret.value;
    if (isNew) {
      out.provider = provider.value;
      out.companyId = scope.value || null;
    } else {
      out.mode = mode.value;
    }
    return out;
  };

  dialog({
    title: t(isNew ? 'admin.sso.add' : 'admin.sso.edit'),
    body,
    wide: true,
    actions: [
      {
        label: t('admin.sso.save'),
        primary: true,
        onClick: async (dlg) => {
          try {
            if (isNew) await call('POST', '/admin/sso/configs', payload());
            else await call('PATCH', `/admin/sso/configs/${encodeURIComponent(cfg.id)}`, payload());
          } catch (err) {
            dlg.setError(ssoErr(err));
            return false;
          }
          toast(t(isNew ? 'admin.sso.created' : 'admin.sso.saved'));
          await onSaved();
          return true;
        },
      },
    ],
  });
}
