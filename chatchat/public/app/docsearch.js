// Самостоятелното търсене на документи и бързият преглед на код (FR-03, §12.1 „Error code
// shortcut“) — от началния екран, извън чата. Таблото (сериен номер) или моделът + HW/FW се
// попълват от отворения случай; сървърът прилага същите филтри като AI. Резултатът се отваря във
// визуализатора (docview.js). На мобилен диалогът е на цял екран (docsearch.css).

import { api } from './api.js';
import { $, $$, clear, h, show } from './dom.js';
import { errorText } from './errors.js';
import { has, t } from './i18n.js';
import { openSource } from './docview.js';
import { codeHit, docHit } from './docsearch-render.js';
import { wireProductSearch } from './cases.js';
import { on, state } from './store.js';

const TYPES = ['MANUAL', 'SCHEMATIC', 'ERROR_LIST', 'FAQ', 'BULLETIN', 'PROCEDURE', 'SOLVED_CASE'];

const val = (sel) => $(sel).value.trim();
const searchError = (err) =>
  err?.code && has(`docsearch.err.${err.code}`) ? t(`docsearch.err.${err.code}`) : errorText(err);

function fillTypes() {
  const select = $('#ds-type');
  const current = select.value;
  clear(select).append(
    h('option', { value: '' }, t('docsearch.anyType')),
    ...TYPES.map((type) =>
      h(
        'option',
        { value: type },
        has(`admin.docType.${type}`) ? t(`admin.docType.${type}`) : type,
      ),
    ),
  );
  select.value = current;
}

/** Таблото/моделът от отворения случай — техникът не въвежда нищо повторно. */
function prefill() {
  const c = state.current?.case?.context ?? {};
  $('#ds-serial').value = c.serial ?? '';
  $('#ds-model').value = c.productModel ?? '';
  $('#ds-hw').value = c.hardwareRevision ?? '';
  $('#ds-fw').value = c.firmware ?? '';
  $('#ds-code').value = c.errorCode ?? '';
}

/** Параметрите за таблото: със сериен номер — само той (сървърът чете регистъра). */
function boardParams() {
  const serial = val('#ds-serial');
  if (serial) return { serial };
  const p = {};
  if (val('#ds-model')) p.model = val('#ds-model');
  if (val('#ds-hw')) p.hw = val('#ds-hw');
  if (val('#ds-fw')) p.fw = val('#ds-fw');
  return p;
}

function selectTab(which) {
  const docs = which === 'docs';
  for (const [tab, panel, on2] of [
    ['#ds-tab-docs', '#ds-panel-docs', docs],
    ['#ds-tab-code', '#ds-panel-code', !docs],
  ]) {
    $(tab).setAttribute('aria-selected', String(on2));
    $(tab).tabIndex = on2 ? 0 : -1;
    show($(panel), on2);
  }
}

async function runSearch() {
  const status = $('#ds-status');
  const list = $('#ds-results');
  const params = new URLSearchParams({ ...boardParams() });
  if (val('#ds-q')) params.set('q', val('#ds-q'));
  if ($('#ds-type').value) params.set('type', $('#ds-type').value);
  if ($('#ds-lang').value) params.set('language', $('#ds-lang').value);
  status.textContent = t('docsearch.searching');
  clear(list);
  try {
    const data = await api('GET', `/documents/search?${params}`);
    const results = Array.isArray(data.results) ? data.results : [];
    status.textContent = results.length
      ? t('docsearch.count', { n: results.length })
      : t('docsearch.none');
    list.append(...results.map((hit) => docHit(hit, openSource)));
  } catch (err) {
    status.textContent = searchError(err);
  }
}

async function runCode() {
  const status = $('#ds-code-status');
  const box = $('#ds-code-results');
  const code = val('#ds-code');
  clear(box);
  if (!code) {
    $('#ds-code').focus();
    return;
  }
  const params = new URLSearchParams(boardParams());
  if (!params.has('serial') && !params.has('model')) {
    status.textContent = t('docsearch.needBoard');
    $('#ds-model').focus();
    return;
  }
  status.textContent = t('docsearch.searching');
  try {
    const data = await api('GET', `/errors/${encodeURIComponent(code)}?${params}`);
    const errors = Array.isArray(data.errors) ? data.errors : [];
    status.textContent = errors.length
      ? t('docsearch.codeCount', { n: errors.length })
      : t('docsearch.codeNone', { code });
    box.append(...errors.map((e) => codeHit(e, openSource)));
  } catch (err) {
    status.textContent = searchError(err);
  }
}

/** Отваря диалога на дадения раздел („docs“ | „code“). */
export function openDocSearch(which = 'docs') {
  const dlg = $('#dlg-docsearch');
  fillTypes();
  prefill();
  selectTab(which);
  $('#ds-status').textContent = '';
  $('#ds-code-status').textContent = '';
  clear($('#ds-results'));
  clear($('#ds-code-results'));
  if (!dlg.open) dlg.showModal();
  (which === 'code' ? $('#ds-code') : $('#ds-q')).focus();
}

export function initDocSearch() {
  $('#btn-docsearch').addEventListener('click', () => openDocSearch('docs'));
  $('#btn-codelookup').addEventListener('click', () => openDocSearch('code'));
  $('#ds-tab-docs').addEventListener('click', () => selectTab('docs'));
  $('#ds-tab-code').addEventListener('click', () => selectTab('code'));
  // Стрелките между разделите (модел на ARIA tabs).
  for (const tab of $$('.ds-tab')) {
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tab.id === 'ds-tab-docs' ? 'code' : 'docs';
      selectTab(next);
      $(next === 'code' ? '#ds-tab-code' : '#ds-tab-docs').focus();
    });
  }
  $('#ds-form').addEventListener('submit', (e) => {
    e.preventDefault();
    void runSearch();
  });
  $('#ds-code-form').addEventListener('submit', (e) => {
    e.preventDefault();
    void runCode();
  });
  wireProductSearch($('#ds-model'));
  on('lang', () => {
    if ($('#dlg-docsearch').open) fillTypes();
  });
}
