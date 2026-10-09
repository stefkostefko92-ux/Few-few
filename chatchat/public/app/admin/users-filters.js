// Филтрите на директорията (FR-23): бързи филтри, търсене, роля и запазени филтри. Филтрирането е
// на сървъра; тук се държи само състоянието и се рисуват контролите.

import { t } from '../i18n.js';
import { call, ROLES } from './core.js';
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
import { roleOptions } from './users-common.js';

/** Празен филтър. Ключовете съвпадат със `UserFilterSchema` на сървъра. */
export const emptyFilter = () => ({});

/** Бързите филтри от §12.4: [ключ в състоянието, стойност, етикет]. */
const PRESETS = [
  ['kind', 'INTERNAL', 'admin.users.f.internal'],
  ['kind', 'PORTAL', 'admin.users.f.portal'],
  ['active', false, 'admin.users.f.inactive'],
  ['mfa', 'on', 'admin.users.f.mfaOn'],
  ['mfa', 'off', 'admin.users.f.mfaOff'],
  ['expiringWithinDays', 30, 'admin.users.f.expiring'],
];

/** Параметри за GET /admin/users от състоянието на филтъра. */
export function filterQuery(f) {
  const q = {};
  if (f.q) q.q = f.q;
  if (f.role) q.role = f.role;
  if (f.kind) q.kind = f.kind;
  if (f.active !== undefined) q.active = String(f.active);
  if (f.mfa) q.mfa = f.mfa;
  if (f.expiringWithinDays) q.expiringWithinDays = f.expiringWithinDays;
  return q;
}

/** Само известните полета (запазен филтър от друга версия не бива да чупи заявката). */
function clean(raw) {
  const f = {};
  if (typeof raw.q === 'string' && raw.q) f.q = raw.q;
  if (ROLES.includes(raw.role)) f.role = raw.role;
  if (raw.kind === 'INTERNAL' || raw.kind === 'PORTAL') f.kind = raw.kind;
  if (typeof raw.active === 'boolean') f.active = raw.active;
  if (raw.mfa === 'on' || raw.mfa === 'off') f.mfa = raw.mfa;
  if (Number.isInteger(raw.expiringWithinDays)) f.expiringWithinDays = raw.expiringWithinDays;
  return f;
}

/**
 * Лентата с филтри. `state.filter` е обектът, който модулът чете; `onChange()` се вика след
 * всяка промяна (търсенето — с пауза от модула).
 */
export function filterBar(state, onChange) {
  const bar = h('div', { class: 'filters' });
  const chips = h('div', {
    class: 'chips',
    role: 'group',
    'aria-label': t('admin.users.quickFilters'),
  });
  const search = input({
    type: 'search',
    placeholder: t('admin.users.search.placeholder'),
    value: state.filter.q ?? '',
    maxlength: 80,
  });
  const role = select(
    [{ value: '', label: t('admin.users.allRoles') }, ...roleOptions(ROLES)],
    state.filter.role ?? '',
  );
  const saved = select([{ value: '', label: t('admin.users.saved.none') }], '');
  let savedList = [];

  const drawChips = () => {
    chips.replaceChildren(
      ...PRESETS.map(([key, value, label]) => {
        const on = state.filter[key] === value;
        return h(
          'button',
          {
            type: 'button',
            class: 'chip',
            'aria-pressed': String(on),
            onclick: () => {
              if (on) delete state.filter[key];
              else state.filter[key] = value;
              drawChips();
              onChange();
            },
          },
          t(label),
        );
      }),
    );
  };

  const apply = (filter) => {
    state.filter = clean(filter);
    search.value = state.filter.q ?? '';
    role.value = state.filter.role ?? '';
    drawChips();
    onChange();
  };

  search.addEventListener('input', () => {
    const v = search.value.trim();
    if (v) state.filter.q = v;
    else delete state.filter.q;
    onChange({ debounce: true });
  });
  role.addEventListener('change', () => {
    if (role.value) state.filter.role = role.value;
    else delete state.filter.role;
    onChange();
  });

  const loadSaved = async (selectedId = '') => {
    try {
      savedList = (await call('GET', '/saved-filters?scope=USERS')).filters;
    } catch {
      savedList = [];
    }
    saved.replaceChildren(
      h('option', { value: '' }, t('admin.users.saved.none')),
      ...savedList.map((f) =>
        h(
          'option',
          { value: f.id },
          f.shared ? `${f.name} (${t('admin.users.saved.shared')})` : f.name,
        ),
      ),
    );
    saved.value = savedList.some((f) => f.id === selectedId) ? selectedId : '';
    del.disabled = saved.value === '';
  };

  saved.addEventListener('change', () => {
    const f = savedList.find((x) => x.id === saved.value);
    del.disabled = !f;
    if (f) apply(f.filter ?? {});
  });

  const save = button(t('admin.users.saved.save'), () => {
    const name = input({ maxlength: 80, required: true });
    const shared = checkbox(t('admin.users.saved.shareWithTeam'));
    dialog({
      title: t('admin.users.saved.save'),
      body: [
        field(t('admin.users.saved.name'), name),
        shared,
        h('p', { class: 'hint' }, t('admin.users.saved.hint')),
      ],
      actions: [
        {
          label: t('admin.save'),
          primary: true,
          onClick: async () => {
            const created = await call('POST', '/saved-filters', {
              scope: 'USERS',
              name: name.value.trim(),
              filter: state.filter,
              shared: shared.querySelector('input').checked,
            });
            await loadSaved(created.filter.id);
            toast(t('admin.users.saved.saved'));
          },
        },
      ],
    });
  });
  const del = button(t('admin.users.saved.delete'), async () => {
    const f = savedList.find((x) => x.id === saved.value);
    if (!f) return;
    const ok = await confirmDialog({
      title: t('admin.users.saved.delete'),
      message: t('admin.users.saved.confirmDelete', { name: f.name }),
      confirmLabel: t('admin.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await call('DELETE', `/saved-filters/${f.id}`);
      await loadSaved();
      toast(t('admin.users.saved.deleted'));
    } catch (err) {
      toast(errText(err), 'err');
    }
  });
  del.disabled = true;

  const clear = button(t('admin.users.clearFilters'), () => {
    state.filter = emptyFilter();
    search.value = '';
    role.value = '';
    saved.value = '';
    del.disabled = true;
    drawChips();
    onChange();
  });

  bar.append(
    h(
      'div',
      { class: 'filters-row' },
      field(t('admin.users.search'), search),
      field(t('admin.users.role'), role),
      field(t('admin.users.saved.label'), saved),
    ),
    h('div', { class: 'filters-foot' }, chips, h('div', { class: 'btn-row' }, save, del, clear)),
  );
  drawChips();
  void loadSaved();
  return bar;
}
