// Бърз отговор (FR-20, AC-15): шаблон по роли и език. Публикуван/отписан се редактира като НОВА
// версия-чернова; черновата — на място. Сървърът само връща текста за редакция — не изпраща нищо.

import { t } from '../i18n.js';
import { ApiError, call, ROLES } from './core.js';
import { checkbox, dialog, field, h, input, select, textarea, toast } from './ui.js';
import { roleLabel } from './users-common.js';

export const LOCALES = ['it', 'en'];
export const localeLabel = (l) => ({ it: 'Italiano', en: 'English' })[l] ?? l;

export function quickForm(existing, reload) {
  const shortcut = input({
    required: true,
    maxlength: 40,
    pattern: '[a-z0-9][a-z0-9_\\-]{0,39}',
    value: existing?.shortcut ?? '',
    disabled: existing ? true : undefined,
    autocapitalize: 'off',
  });
  const locale = select(
    LOCALES.map((l) => ({ value: l, label: localeLabel(l) })),
    existing?.locale ?? 'it',
    { disabled: existing ? true : undefined },
  );
  const title = input({ required: true, maxlength: 120, value: existing?.title ?? '' });
  const body = textarea({ rows: 6, required: true, maxlength: 4000 });
  body.value = existing?.body ?? '';
  const roles = h(
    'fieldset',
    { class: 'fieldset' },
    h('legend', {}, t('admin.quick.roles')),
    ...ROLES.map((r) =>
      checkbox(roleLabel(r), { value: r, checked: existing?.roleScope.includes(r) || undefined }),
    ),
  );
  const checked = () => [...roles.querySelectorAll('input:checked')].map((i) => i.value);
  const published =
    existing && (existing.status === 'PUBLISHED' || existing.status === 'DEPRECATED');

  dialog({
    title: existing ? t('admin.quick.edit', { shortcut: existing.shortcut }) : t('admin.quick.new'),
    wide: true,
    body: [
      published ? h('p', { class: 'note note-warn' }, t('admin.quick.newVersionNote')) : null,
      h(
        'div',
        { class: 'field-row' },
        field(t('admin.quick.shortcut'), shortcut, { hint: t('admin.quick.shortcut.hint') }),
        field(t('admin.quick.locale'), locale),
      ),
      field(t('admin.quick.title'), title),
      field(t('admin.quick.body'), body, { hint: t('admin.quick.body.hint') }),
      roles,
    ],
    actions: [
      {
        label: t('admin.save'),
        primary: true,
        onClick: async () => {
          const scope = checked();
          if (scope.length === 0) {
            throw new ApiError(400, 'roles_required');
          }
          const payload = { title: title.value.trim(), body: body.value.trim(), roleScope: scope };
          if (existing) {
            await call('PATCH', `/quick-responses/${existing.id}`, payload);
            toast(published ? t('admin.quick.versioned') : t('admin.quick.updated'));
          } else {
            await call('POST', '/quick-responses', {
              ...payload,
              shortcut: shortcut.value.trim().toLowerCase(),
              locale: locale.value,
            });
            toast(t('admin.quick.created'));
          }
          reload();
        },
      },
    ],
  });
}
