import { api } from './api.js';
import { $, announce, h, clear, show } from './dom.js';
import { errorText } from './errors.js';
import { t } from './i18n.js';
import { fillPhaseSelect, refreshCases, renderCases, wireProductSearch } from './cases.js';
import { emit, on, state } from './store.js';

const tx = (key, fallback) => (t(key) === key ? fallback : t(key));
const emptyToNull = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

function flash(el, text, isError = false) {
  el.textContent = text;
  el.classList.toggle('form-error', isError);
  el.classList.toggle('form-note', !isError);
  show(el, text !== '');
}

export function renderContext() {
  const cur = state.current?.case;
  const form = $('#ctx-form');
  const actions = $('#actions');
  const empty = $('#ctx-empty');
  const summary = $('#ctx-summary');
  if (!cur) {
    show(form, false);
    show(actions, false);
    show(empty, true);
    summary.textContent = '';
    return;
  }
  const c = cur.context ?? {};
  show(empty, false);
  show(form, true);
  show(actions, true);
  $('#ctx-model').value = c.productModel ?? '';
  $('#ctx-hw').value = c.hardwareRevision ?? '';
  $('#ctx-fw').value = c.firmware ?? '';
  $('#ctx-serial').value = c.serial ?? '';
  $('#ctx-error').value = c.errorCode ?? '';
  fillPhaseSelect($('#ctx-phase'), c.phase);
  renderSummary(c);
  renderOutcome(cur);
}

function renderSummary(c) {
  const dash = t('ctx.unset');
  const s = $('#ctx-summary');
  clear(s).append(
    h(
      'span',
      { class: 'sum-item' },
      h('span', { class: 'sum-k' }, t('ctx.model')),
      ' ',
      h('b', null, c.productModel || dash),
    ),
    h(
      'span',
      { class: 'sum-item' },
      h('span', { class: 'sum-k' }, 'HW'),
      ' ',
      h('b', null, c.hardwareRevision || dash),
    ),
    h(
      'span',
      { class: 'sum-item' },
      h('span', { class: 'sum-k' }, 'FW'),
      ' ',
      h('b', null, c.firmware || dash),
    ),
  );
}

function renderOutcome(cur) {
  $('#case-outcome').textContent = cur.outcome
    ? tx(`outcome.${cur.outcome}`, String(cur.outcome))
    : t('outcome.none');
  const tk = state.tickets.get(cur.id);
  const line = $('#case-ticket');
  if (tk) {
    line.textContent = t('ticket.line', {
      number: tk.number,
      status: tx(`ticketstatus.${tk.status}`, String(tk.status ?? '')),
    });
  }
  show(line, Boolean(tk));
  $('#btn-resolved').setAttribute('aria-pressed', String(cur.outcome === 'RESOLVED'));
  $('#btn-unresolved').setAttribute('aria-pressed', String(cur.outcome === 'NOT_RESOLVED'));
}

export function initContext() {
  const ctx = $('#ctx');
  const toggle = $('#ctx-toggle');
  toggle.addEventListener('click', () => {
    const open = ctx.dataset.open !== 'true';
    ctx.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  wireProductSearch($('#ctx-model'));

  // Desktop: il contesto è sempre aperto, il pulsante non serve (nessun controllo inerte).
  const mq = window.matchMedia('(min-width: 1100px)');
  const syncToggle = () => {
    toggle.disabled = mq.matches;
    if (mq.matches) {
      toggle.removeAttribute('aria-expanded');
      toggle.removeAttribute('aria-controls');
    } else {
      toggle.setAttribute('aria-expanded', String(ctx.dataset.open === 'true'));
      toggle.setAttribute('aria-controls', 'ctx-body');
    }
  };
  mq.addEventListener('change', syncToggle);
  syncToggle();

  on('case:loaded', () => {
    flash($('#ctx-feedback'), '');
    flash($('#actions-feedback'), '');
    renderContext();
  });
  on('case:loading', () => {
    state.current = null;
    renderContext();
  });
  on('lang', () => {
    const cur = state.current?.case;
    if (!cur) return;
    fillPhaseSelect($('#ctx-phase'), $('#ctx-phase').value);
    renderSummary(cur.context ?? {});
    renderOutcome(cur);
  });

  $('#ctx-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cur = state.current?.case;
    if (!cur) return;
    const fb = $('#ctx-feedback');
    const model = $('#ctx-model').value.trim();
    if (!model) {
      flash(fb, t('ctx.modelRequired'), true);
      $('#ctx-model').focus();
      return;
    }
    const context = {
      ...cur.context,
      productModel: model,
      hardwareRevision: emptyToNull($('#ctx-hw').value),
      firmware: emptyToNull($('#ctx-fw').value),
      serial: emptyToNull($('#ctx-serial').value),
      errorCode: emptyToNull($('#ctx-error').value),
      phase: $('#ctx-phase').value,
    };
    try {
      const data = await api('PATCH', `/cases/${encodeURIComponent(cur.id)}/context`, { context });
      state.current.case = data.case;
      const idx = state.cases.findIndex((x) => x.id === data.case.id);
      if (idx >= 0) state.cases[idx] = data.case;
      renderCases();
      renderContext();
      flash(fb, t('ctx.saved'));
    } catch (err) {
      flash(fb, errorText(err), true);
    }
  });

  const setOutcome = async (outcome) => {
    const cur = state.current?.case;
    if (!cur) return;
    const fb = $('#actions-feedback');
    try {
      const data = await api('POST', `/cases/${encodeURIComponent(cur.id)}/outcome`, { outcome });
      state.current.case = {
        ...cur,
        ...(data?.case ?? {}),
        outcome: data?.case?.outcome ?? outcome,
      };
      renderOutcome(state.current.case);
      flash(fb, t('actions.outcomeSaved'));
      refreshCases();
    } catch (err) {
      flash(fb, errorText(err), true);
    }
  };
  $('#btn-resolved').addEventListener('click', () => setOutcome('RESOLVED'));
  $('#btn-unresolved').addEventListener('click', () => setOutcome('NOT_RESOLVED'));
  $('#btn-ticket').addEventListener('click', () => openTicketDialog(''));

  // Тикет
  const dlg = $('#dlg-ticket');
  const form = $('#ticket-form');
  const err = $('#ticket-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cur = state.current?.case;
    if (!cur) return;
    const reason = $('#ticket-reason').value.trim();
    if (!reason) {
      flash(err, t('ticket.required'), true);
      $('#ticket-reason').focus();
      return;
    }
    const submit = $('#ticket-submit');
    submit.disabled = true;
    try {
      const data = await api('POST', '/tickets', { caseId: cur.id, reason });
      state.tickets.set(cur.id, data.ticket);
      dlg.close();
      renderOutcome(cur);
      flash($('#actions-feedback'), t('ticket.created', { number: data.ticket.number }));
      announce(t('ticket.created', { number: data.ticket.number }));
      refreshCases();
    } catch (ex) {
      flash(err, errorText(ex), true);
    } finally {
      submit.disabled = false;
    }
  });
  emit('context:ready');
}

export function openTicketDialog(reason) {
  const dlg = $('#dlg-ticket');
  $('#ticket-reason').value = reason ?? '';
  show($('#ticket-error'), false);
  dlg.showModal();
  $('#ticket-reason').focus();
}
