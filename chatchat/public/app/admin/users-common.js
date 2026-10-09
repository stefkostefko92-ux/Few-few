// Общото за директорията: кого може да управлява влезлият, роли, фирми, поле „причина“, линк за парола.

import { t } from '../i18n.js';
import { call, fmtDateTime, me, ROLES, roleRank } from './core.js';
import { dialog, field, h, onceSecret, textarea } from './ui.js';

export const roleLabel = (role) => t(`admin.role.${role}`);

/** Роли, които влезлият може да дава: не над своя ранг (сървърът отказва иначе). */
export function assignableRoles() {
  return ROLES.filter((r) => roleRank(r) <= roleRank(me.user.role));
}

export const roleOptions = (roles = assignableRoles()) =>
  roles.map((r) => ({ value: r, label: roleLabel(r) }));

/** Какво UI предлага за дадения акаунт. Сървърът решава всичко; това само скрива безполезното. */
export function permissionsFor(target) {
  const self = target.id === me.user.id;
  const higher = roleRank(target.role) > roleRank(me.user.role);
  const blocked = target.erased || higher;
  return {
    self,
    higher,
    erased: target.erased,
    any: !blocked,
    edit: !blocked && !self,
    link: !blocked,
    revoke: !blocked && !self,
    resetMfa: !blocked && !self,
    export: !blocked,
    erase: !blocked && !self,
    select: !blocked && !self,
  };
}

let companiesCache = null;

/** Фирмите на клиента (за избор); кешът важи за страницата. */
export async function loadCompanies() {
  if (!companiesCache) companiesCache = (await call('GET', '/admin/companies')).companies;
  return companiesCache;
}

export const companyOptions = (companies, emptyLabel = '—') => [
  { value: '', label: emptyLabel },
  ...companies.map((c) => ({ value: c.id, label: c.name })),
];

/** Причината е задължителна (3–500 знака) и отива в одита — без лични данни. */
export function reasonField({ required = true } = {}) {
  const area = textarea({
    rows: 3,
    maxlength: 500,
    minlength: required ? 3 : undefined,
    required: required || undefined,
  });
  return {
    area,
    node: field(t('admin.reason'), area, { hint: t('admin.reason.hint') }),
    value: () => area.value.trim(),
  };
}

/** Линкът за парола се показва САМО тук и само веднъж — после няма как да се възстанови. */
export function showSecretLink({ title, url, expiresAt }) {
  dialog({
    title,
    cancel: false,
    closeLabel: t('admin.once.done'),
    body: [
      onceSecret({
        label: t('admin.once.linkLabel'),
        value: url,
        note: t('admin.once.expires', { when: fmtDateTime(expiresAt) }),
      }),
      h('p', { class: 'hint' }, t('admin.once.noPassword')),
    ],
    actions: [{ label: t('admin.once.done'), primary: true }],
  });
}

export function definitionList(pairs) {
  const dl = h('dl', { class: 'facts' });
  for (const [k, v] of pairs) {
    dl.append(h('dt', {}, k), h('dd', {}, v === '' || v == null ? '—' : v));
  }
  return dl;
}
