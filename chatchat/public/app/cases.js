import { api } from './api.js';
import { $, clear, h, show } from './dom.js';
import { errorText } from './errors.js';
import { roleLabel } from './format.js';
import { getLang, t } from './i18n.js';
import { emit, on, state } from './store.js';
import { setFlow } from './flow/state.js';

export const PHASES = [
  'startup',
  'travel',
  'leveling',
  'doors',
  'stop',
  'standby',
  'maintenance',
  'unknown',
];

const tx = (key, fallback) => (t(key) === key ? fallback : t(key));

function fmtDate(iso) {
  try {
    return new Intl.DateTimeFormat(getLang(), {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function fillPhaseSelect(select, value) {
  clear(select);
  for (const p of PHASES) select.append(h('option', { value: p }, t(`phase.${p}`)));
  select.value = PHASES.includes(value) ? value : 'unknown';
}

function caseItem(c) {
  const ctx = c.context ?? {};
  const active = c.id === state.currentId;
  const assignee = c.assignedTo
    ? c.assignedTo.id === state.user?.id
      ? t('case.assignedToYou')
      : (c.assignedTo.name ?? roleLabel(c.assignedTo.role))
    : null;
  return h(
    'li',
    null,
    h(
      'button',
      {
        class: `case-item${active ? ' is-active' : ''}`,
        type: 'button',
        'aria-current': active ? 'true' : null,
        onclick: () => selectCase(c.id),
      },
      h(
        'span',
        { class: 'case-top' },
        h('span', { class: 'case-number mono' }, String(c.number)),
        h('span', { class: 'case-status' }, tx(`status.${c.status}`, String(c.status ?? ''))),
      ),
      h(
        'span',
        { class: 'case-model' },
        ctx.productModel ? String(ctx.productModel) : t('cases.noModel'),
      ),
      ctx.errorCode
        ? h(
            'span',
            { class: 'case-error mono' },
            t('cases.errorCode', { code: String(ctx.errorCode) }),
          )
        : null,
      h(
        'span',
        { class: 'case-meta' },
        c.outcome ? `${tx(`outcome.${c.outcome}`, String(c.outcome))} · ` : '',
        assignee ? `${assignee} · ` : '',
        fmtDate(c.updatedAt ?? c.createdAt),
      ),
    ),
  );
}

export function renderCases() {
  const list = $('#cases-list');
  const note = $('#cases-state');
  const assigned = $('#assigned-list');
  clear(list);
  clear(assigned);
  const mine = state.cases.filter(
    (c) => c.assignedTo?.id === state.user?.id && c.status !== 'RESOLVED',
  );
  for (const c of mine) assigned.append(caseItem(c));
  const empty = assigned.parentElement.querySelector('.side-empty');
  if (empty) empty.hidden = mine.length > 0;
  const set = (key, n) => {
    const el = document.querySelector(`[data-count="${key}"]`);
    if (el) el.textContent = n > 0 ? `(${n})` : '';
  };
  set('assigned', mine.length);
  set('cases', state.cases.length);
  if (!state.cases.length) {
    note.textContent = t('cases.empty');
    show(note, true);
    return;
  }
  show(note, false);
  for (const c of state.cases) list.append(caseItem(c));
}

export async function loadCases() {
  const note = $('#cases-state');
  note.textContent = t('cases.loading');
  show(note, true);
  try {
    const data = await api('GET', '/cases');
    state.cases = Array.isArray(data.cases) ? data.cases : [];
    renderCases();
  } catch (err) {
    note.textContent = `${t('cases.error')} ${errorText(err)}`;
    show(note, true);
  }
}

/** Тих опреснител след действие (статус/ резултат се менят на сървъра). */
export async function refreshCases() {
  try {
    const data = await api('GET', '/cases');
    state.cases = Array.isArray(data.cases) ? data.cases : state.cases;
    renderCases();
  } catch {
    /* списъкът остава както е */
  }
}

export async function selectCase(id) {
  state.currentId = id;
  state.current = null;
  renderCases();
  emit('case:loading', id);
  try {
    const data = await api('GET', `/cases/${encodeURIComponent(id)}`);
    if (state.currentId !== id) return;
    state.current = {
      case: data.case,
      messages: Array.isArray(data.messages) ? data.messages : [],
    };
    // Тикетът, стъпките и правата идват от сървъра — не се губят при презареждане на страницата.
    if (data.ticket) state.tickets.set(id, data.ticket);
    setFlow(id, data);
    emit('case:loaded', id);
  } catch (err) {
    if (state.currentId !== id) return;
    emit('case:error', err);
  }
}

/* ---------- Нов случай ---------- */

const emptyToNull = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

let searchTimer = 0;
export function wireProductSearch(input) {
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (q.length < 2) return;
    searchTimer = setTimeout(async () => {
      try {
        const data = await api('GET', `/products/search?q=${encodeURIComponent(q)}`);
        const list = $('#product-options');
        clear(list);
        for (const p of Array.isArray(data.products) ? data.products : []) {
          list.append(
            h('option', { value: String(p.model) }, p.description ? String(p.description) : ''),
          );
        }
      } catch {
        /* подсказките са по желание */
      }
    }, 250);
  });
}

/** Нов случай с контекста на таблото (от QR или от сериен номер): диалогът се попълва, човекът потвърждава. */
export function openNewCaseWithDevice(device) {
  $('#btn-new-case').click();
  $('#new-serial').value = device.serial ?? '';
  $('#new-model').value = device.productModel ?? '';
  $('#new-hw').value = device.hardwareRevision ?? '';
  $('#new-fw').value = device.firmware ?? '';
  const msg = $('#new-lookup-msg');
  msg.textContent = t('new.lookupFound');
  show(msg, true);
  $('#new-error').focus();
}

export function initNewCase() {
  const dlg = $('#dlg-new');
  const form = $('#new-form');
  const msg = $('#new-lookup-msg');
  const err = $('#new-error-msg');

  const open = () => {
    form.reset();
    fillPhaseSelect($('#new-phase'), 'unknown');
    show(msg, false);
    show(err, false);
    dlg.showModal();
    $('#new-serial').focus();
  };
  $('#btn-new-case').addEventListener('click', open);
  $('#btn-new-case-empty').addEventListener('click', open);
  on('lang', () => {
    if (dlg.open) fillPhaseSelect($('#new-phase'), $('#new-phase').value);
  });
  wireProductSearch($('#new-model'));

  $('#new-lookup').addEventListener('click', async () => {
    const serial = $('#new-serial').value.trim();
    if (!serial) return $('#new-serial').focus();
    try {
      const { device } = await api('GET', `/devices/${encodeURIComponent(serial)}`);
      $('#new-model').value = device.productModel ?? '';
      $('#new-hw').value = device.hardwareRevision ?? '';
      $('#new-fw').value = device.firmware ?? '';
      msg.textContent = t('new.lookupFound');
    } catch (e) {
      msg.textContent = e.status === 404 ? t('new.lookupNotFound') : t('new.lookupError');
    }
    show(msg, true);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const model = $('#new-model').value.trim();
    if (!model) {
      err.textContent = t('ctx.modelRequired');
      show(err, true);
      $('#new-model').focus();
      return;
    }
    show(err, false);
    const serial = emptyToNull($('#new-serial').value);
    const context = {
      productModel: model,
      hardwareRevision: emptyToNull($('#new-hw').value),
      firmware: emptyToNull($('#new-fw').value),
      serial,
      errorCode: emptyToNull($('#new-error').value),
      phase: $('#new-phase').value,
      symptoms: $('#new-symptoms')
        .value.split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      observations: [],
      options: {},
    };
    const submit = $('#new-submit');
    submit.disabled = true;
    try {
      const body = { context };
      if (serial) body.deviceSerial = serial;
      const data = await api('POST', '/sessions', body);
      dlg.close();
      state.cases = [data.case, ...state.cases.filter((c) => c.id !== data.case.id)];
      emit('case:created', data.case.id);
      await selectCase(data.case.id);
    } catch (ex) {
      err.textContent = errorText(ex);
      show(err, true);
    } finally {
      submit.disabled = false;
    }
  });
}
