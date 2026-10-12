// „Решен случай → знание“ (§11.3 „Caso risolto → non entra automaticamente nella KB; richiede
// review“) в панела на случая: само за персонала с `proposal:create` и само за решен случай.
// Сървърът прави ЧЕРНОВА документ SOLVED_CASE (анонимизирана) и предложение в опашката на
// отговорника за знанието; тук е само формата и статусът. Порталът не вижда нито бутона, нито опашката.

import { api } from './api.js';
import { $, announce, show } from './dom.js';
import { errorText } from './errors.js';
import { has, t } from './i18n.js';
import { on, state } from './store.js';

/** Способността на вписания (кеш по потребител — друг вход → нова проверка). */
let capFor = null;
let capPromise = null;

function canPropose() {
  const userId = state.user?.id ?? null;
  if (capFor !== userId || capPromise === null) {
    capFor = userId;
    capPromise = api('GET', '/auth/me')
      .then((me) => Array.isArray(me?.capabilities) && me.capabilities.includes('proposal:create'))
      .catch(() => false);
  }
  return capPromise;
}

const proposalError = (err) =>
  err?.code && has(`proposal.err.${err.code}`) ? t(`proposal.err.${err.code}`) : errorText(err);

function setStatus(text) {
  const el = $('#propose-status');
  el.textContent = text;
  show(el, text !== '');
}

async function refresh() {
  const btn = $('#btn-propose');
  const cur = state.current?.case;
  show(btn, false);
  setStatus('');
  if (!cur || !(await canPropose())) return;
  if (state.current?.case?.id !== cur.id || cur.status !== 'RESOLVED') return;
  try {
    const data = await api('GET', `/proposals/solved-case/${encodeURIComponent(cur.id)}`);
    if (state.current?.case?.id !== cur.id) return;
    const p = data.proposal;
    if (p) {
      setStatus(
        t('proposal.statusLine', {
          status: t(`proposal.status.${p.status}`),
          code: p.draftDocument ? `${p.draftDocument.code} · ${p.draftDocument.revision}` : '—',
        }),
      );
    }
    show(btn, !data.open);
  } catch {
    show(btn, true);
  }
}

function openDialog() {
  const dlg = $('#dlg-propose');
  $('#pr-form').reset();
  show($('#pr-error'), false);
  dlg.showModal();
  $('#pr-name').focus();
}

async function submit(e) {
  e.preventDefault();
  const cur = state.current?.case;
  if (!cur) return;
  const err = $('#pr-error');
  const title = $('#pr-name').value.trim();
  if (title.length < 3) {
    err.textContent = t('proposal.titleRequired');
    show(err, true);
    $('#pr-name').focus();
    return;
  }
  const opt = (sel) => {
    const v = $(sel).value.trim();
    return v ? v : undefined;
  };
  const body = {
    caseId: cur.id,
    title,
    rootCause: opt('#pr-cause'),
    solution: opt('#pr-solution'),
    audience: $('#pr-audience').value,
    firmwareScope: $('#pr-fw').value,
    matchOptions: $('#pr-options').checked,
    note: opt('#pr-note'),
  };
  const btn = $('#pr-submit');
  btn.disabled = true;
  try {
    const data = await api('POST', '/proposals/solved-case', body);
    $('#dlg-propose').close();
    const p = data.proposal;
    const text = t('proposal.sent', { code: `${p.documentCode} · ${p.revision}` });
    announce(text);
    await refresh();
    setStatus(text);
  } catch (ex) {
    err.textContent = proposalError(ex);
    show(err, true);
  } finally {
    btn.disabled = false;
  }
}

export function initProposeCase() {
  $('#btn-propose').addEventListener('click', openDialog);
  $('#pr-form').addEventListener('submit', submit);
  on('case:loaded', () => void refresh());
  on('case:outcome', () => void refresh());
  on('flow:case', () => void refresh());
  on('case:loading', () => {
    show($('#btn-propose'), false);
    setStatus('');
  });
}
