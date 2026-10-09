// Табла (физическите устройства, §13.1) и QR етикети (FR-13). Търсенето е на сървъра.

import { t } from '../i18n.js';
import { ApiError, call, query } from './core.js';
import { issueQr } from './devices-qr.js';
import { loadProducts, VERSION_PATTERN } from './kb-common.js';
import {
  badge,
  button,
  clear,
  dataTable,
  dialog,
  emptyState,
  errText,
  failure,
  field,
  h,
  input,
  loading,
  sectionHead,
  select,
  textarea,
  toast,
} from './ui.js';

/** „ключ=стойност“ по един на ред → обект (опциите на таблото: инвертор, брой спирки…). */
function parseOptions(text) {
  const out = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (i < 1 || !key || !value || key.length > 40 || value.length > 80) {
      throw new ApiError(400, 'invalid_input');
    }
    out[key] = value;
  }
  return out;
}

async function newDevice(reload) {
  let products = [];
  let companies = [];
  try {
    [products, companies] = await Promise.all([
      loadProducts(),
      call('GET', '/admin/companies').then((r) => r.companies),
    ]);
  } catch (err) {
    toast(errText(err), 'err');
    return;
  }
  if (products.length === 0) {
    toast(t('admin.devices.needProduct'), 'warn');
    return;
  }
  const serial = input({ required: true, maxlength: 80 });
  const model = select(
    products.map((p) => ({ value: p.model, label: p.model })),
    products[0].model,
  );
  const hw = select([], '');
  const syncHw = () => {
    const p = products.find((x) => x.model === model.value);
    hw.replaceChildren(
      ...(p?.revisions ?? []).map((r) => h('option', { value: r.hwRevision }, r.hwRevision)),
    );
  };
  model.addEventListener('change', syncHw);
  syncHw();
  const fw = input({ required: true, pattern: VERSION_PATTERN, maxlength: 20, placeholder: '4.2' });
  const listId = 'company-list';
  const company = input({ maxlength: 120, list: listId });
  const datalist = h(
    'datalist',
    { id: listId },
    ...companies.map((c) => h('option', { value: c.name })),
  );
  const options = textarea({ rows: 3, placeholder: 'inverter=VF-3' });

  dialog({
    title: t('admin.devices.new'),
    wide: true,
    body: [
      field(t('admin.devices.serial'), serial),
      h(
        'div',
        { class: 'field-row' },
        field(t('admin.devices.model'), model),
        field(t('admin.devices.hw'), hw),
      ),
      field(t('admin.devices.fw'), fw),
      field(t('admin.devices.company'), company, { hint: t('admin.devices.company.hint') }),
      datalist,
      field(t('admin.devices.options'), options, { hint: t('admin.devices.options.hint') }),
    ],
    actions: [
      {
        label: t('admin.devices.create'),
        primary: true,
        onClick: async () => {
          await call('POST', '/admin/devices', {
            serial: serial.value.trim(),
            productModel: model.value,
            hwRevision: hw.value,
            firmware: fw.value.trim(),
            ...(company.value.trim() ? { companyName: company.value.trim() } : {}),
            options: parseOptions(options.value),
          });
          toast(t('admin.devices.created', { serial: serial.value.trim() }));
          reload();
        },
      },
    ],
  });
}

export function mount(root) {
  const state = { q: '', devices: [], next: null, serial: 0, timer: null };
  const results = h('div', { class: 'results', 'aria-live': 'polite' });
  const search = input({ type: 'search', placeholder: t('admin.devices.search'), maxlength: 80 });

  const columns = [
    { label: t('admin.devices.serial'), render: (d) => h('strong', { class: 'mono' }, d.serial) },
    { label: t('admin.devices.model'), render: (d) => d.productModel },
    { label: t('admin.devices.hw'), render: (d) => h('span', { class: 'mono' }, d.hwRevision) },
    { label: t('admin.devices.fw'), render: (d) => h('span', { class: 'mono' }, d.firmware) },
    { label: t('admin.devices.company'), render: (d) => d.company?.name ?? '—' },
    {
      label: t('admin.devices.qr'),
      render: (d) =>
        badge(
          d.hasQr ? 'ok' : 'idle',
          d.hasQr ? t('admin.devices.qr.has') : t('admin.devices.qr.none'),
        ),
    },
    {
      label: t('admin.users.col.actions'),
      head: h('span', { class: 'sr-only' }, t('admin.users.col.actions')),
      cls: 'col-actions',
      render: (d) =>
        button(t('admin.devices.qr.new'), () => void issueQr(d, () => void load()), {
          small: true,
          'aria-label': `${t('admin.devices.qr.new')}: ${d.serial}`,
        }),
    },
  ];

  const draw = () => {
    clear(results);
    results.append(
      state.devices.length
        ? dataTable({ columns, rows: state.devices, caption: t('admin.nav.devices') })
        : emptyState(t('admin.devices.empty'), t('admin.devices.empty.hint')),
    );
    if (state.next)
      results.append(
        h(
          'div',
          { class: 'more' },
          button(t('admin.loadMore'), () => void load(true)),
        ),
      );
  };
  async function load(append = false) {
    const mine = ++state.serial;
    if (!append) clear(results).append(loading());
    try {
      const res = await call(
        'GET',
        `/admin/devices${query({ q: state.q, limit: 50, cursor: append ? state.next : '' })}`,
      );
      if (mine !== state.serial) return;
      state.devices = append ? [...state.devices, ...res.devices] : res.devices;
      state.next = res.next;
      draw();
    } catch (err) {
      if (mine === state.serial) clear(results).append(failure(err, () => void load()));
    }
  }
  search.addEventListener('input', () => {
    clearTimeout(state.timer);
    state.q = search.value.trim();
    state.timer = setTimeout(() => void load(), 300);
  });

  root.append(
    sectionHead(
      t('admin.nav.devices'),
      button(t('admin.devices.new'), () => void newDevice(() => void load()), { kind: 'primary' }),
    ),
    h('p', { class: 'muted lead' }, t('admin.devices.lead')),
    h('div', { class: 'toolbar' }, field(t('admin.search'), search)),
    results,
  );
  void load();
  return () => clearTimeout(state.timer);
}
