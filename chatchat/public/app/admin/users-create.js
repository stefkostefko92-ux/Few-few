// Нов потребител (POST /admin/users): без парола — отговорът е еднократен линк за задаване.

import { getLang, t } from '../i18n.js';
import { call, endOfDayIso, todayInput } from './core.js';
import { dialog, errText, field, h, input, select, toast } from './ui.js';
import {
  assignableRoles,
  companyOptions,
  loadCompanies,
  reasonField,
  roleOptions,
  showSecretLink,
} from './users-common.js';

export async function createUser(ctx) {
  let companies = [];
  try {
    companies = await loadCompanies();
  } catch (err) {
    toast(errText(err), 'err');
    return;
  }
  const email = input({ type: 'email', required: true, maxlength: 254, inputmode: 'email' });
  const name = input({ required: true, minlength: 2, maxlength: 120 });
  const role = select(roleOptions(assignableRoles()), 'INTERNAL_TECHNICIAN');
  const company = select(companyOptions(companies, t('admin.users.noCompany')), '');
  const expires = input({ type: 'date', min: todayInput() });
  const locale = select(
    [
      { value: 'it', label: 'Italiano' },
      { value: 'en', label: 'English' },
    ],
    getLang(),
  );
  const reason = reasonField({ required: false });
  const companyField = field(t('admin.users.col.company'), company, {
    hint: t('admin.users.company.hint'),
  });
  // Порталният техник е външен: фирмата е задължителна (сървърът я иска и сам).
  const syncCompany = () => {
    company.required = role.value === 'PORTAL_TECHNICIAN';
  };
  role.addEventListener('change', syncCompany);
  syncCompany();

  dialog({
    title: t('admin.users.new.title'),
    wide: true,
    body: [
      h(
        'div',
        { class: 'field-row' },
        field(t('admin.users.col.email'), email),
        field(t('admin.users.name'), name),
      ),
      h('div', { class: 'field-row' }, field(t('admin.users.col.role'), role), companyField),
      h(
        'div',
        { class: 'field-row' },
        field(t('admin.users.col.expires'), expires, { hint: t('admin.users.expires.hint') }),
        field(t('admin.users.locale'), locale),
      ),
      reason.node,
      h('p', { class: 'hint' }, t('admin.users.new.noPassword')),
    ],
    actions: [
      {
        label: t('admin.users.new.create'),
        primary: true,
        onClick: async () => {
          const body = {
            email: email.value.trim(),
            name: name.value.trim(),
            role: role.value,
            locale: locale.value,
          };
          if (company.value) body.companyId = company.value;
          if (expires.value) body.expiresAt = endOfDayIso(expires.value);
          if (reason.value()) body.reason = reason.value();
          const res = await call('POST', '/admin/users', body);
          toast(t('admin.users.new.created', { name: res.user.name }));
          ctx.reload();
          showSecretLink({
            title: t('admin.users.new.linkTitle', { name: res.user.name }),
            url: res.setPasswordUrl,
            expiresAt: res.setPasswordExpiresAt,
          });
        },
      },
    ],
  });
}
