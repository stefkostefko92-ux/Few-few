// Продукти с HW ревизии и обхват на фърмуера (FR-01, §13.1). API-то създава; няма редакция —
// грешка в обхвата се поправя с нов запис от отговорника по сървъра, затова формата е внимателна.

import { t } from '../i18n.js';
import { call, fwRange } from './core.js';
import { repeater, VERSION_PATTERN } from './kb-common.js';
import {
  button,
  clear,
  dataTable,
  dialog,
  emptyState,
  failure,
  field,
  h,
  input,
  loading,
  sectionHead,
  textarea,
  toast,
} from './ui.js';

function revisionRow() {
  const hw = input({ maxlength: 20, placeholder: 'B' });
  const min = input({
    pattern: VERSION_PATTERN,
    maxlength: 20,
    placeholder: '4.0',
    title: t('admin.products.fw.format'),
  });
  const max = input({
    pattern: VERSION_PATTERN,
    maxlength: 20,
    placeholder: '4.9',
    title: t('admin.products.fw.format'),
  });
  hw.required = true;
  min.required = true;
  const node = h(
    'div',
    { class: 'row row-3' },
    field(t('admin.products.hw'), hw),
    field(t('admin.products.fwMin'), min),
    field(t('admin.products.fwMax'), max),
  );
  return {
    node,
    read: () => ({
      hwRevision: hw.value.trim(),
      fwMin: min.value.trim(),
      ...(max.value.trim() ? { fwMax: max.value.trim() } : {}),
    }),
  };
}

function newProduct(reload) {
  const family = input({ required: true, maxlength: 80 });
  const model = input({ required: true, maxlength: 80 });
  const description = textarea({ maxlength: 1000 });
  const revisions = repeater({
    addLabel: t('admin.products.addRevision'),
    makeRow: revisionRow,
    min: 1,
    max: 50,
  });
  dialog({
    title: t('admin.products.new'),
    wide: true,
    body: [
      h(
        'div',
        { class: 'field-row' },
        field(t('admin.products.family'), family),
        field(t('admin.products.model'), model),
      ),
      field(t('admin.products.description'), description),
      h('h3', { class: 'sub' }, t('admin.products.revisions')),
      h('p', { class: 'hint' }, t('admin.products.revisions.hint')),
      revisions.node,
    ],
    actions: [
      {
        label: t('admin.products.create'),
        primary: true,
        onClick: async () => {
          await call('POST', '/admin/products', {
            family: family.value.trim(),
            model: model.value.trim(),
            description: description.value.trim(),
            revisions: revisions.values(),
          });
          toast(t('admin.products.created', { model: model.value.trim() }));
          reload();
        },
      },
    ],
  });
}

export function mount(root) {
  const results = h('div', { class: 'results' });
  const search = input({ type: 'search', placeholder: t('admin.products.search'), maxlength: 80 });
  let products = [];

  const columns = [
    { label: t('admin.products.family'), render: (p) => p.family },
    { label: t('admin.products.model'), render: (p) => h('strong', { class: 'mono' }, p.model) },
    { label: t('admin.products.description'), render: (p) => p.description || '—' },
    {
      label: t('admin.products.revisions'),
      render: (p) =>
        h(
          'ul',
          { class: 'plain' },
          ...p.revisions.map((r) =>
            h(
              'li',
              {},
              h('span', { class: 'mono' }, r.hwRevision),
              ` · ${t('admin.products.fw')} ${fwRange(r.fwMin, r.fwMax)}`,
            ),
          ),
        ),
    },
  ];

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const rows = products.filter((p) => !q || `${p.family} ${p.model}`.toLowerCase().includes(q));
    clear(results);
    results.append(
      rows.length
        ? dataTable({ columns, rows, caption: t('admin.nav.products') })
        : emptyState(t('admin.products.empty'), t('admin.products.empty.hint')),
    );
  };
  const load = async () => {
    clear(results).append(loading());
    try {
      products = (await call('GET', '/admin/products')).products;
      draw();
    } catch (err) {
      clear(results).append(failure(err, load));
    }
  };
  search.addEventListener('input', draw);

  root.append(
    sectionHead(
      t('admin.nav.products'),
      button(t('admin.products.new'), () => newProduct(load), { kind: 'primary' }),
    ),
    h('p', { class: 'muted lead' }, t('admin.products.lead')),
    h('div', { class: 'toolbar' }, field(t('admin.search'), search)),
    results,
  );
  void load();
}
