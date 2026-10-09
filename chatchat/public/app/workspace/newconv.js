// Нов директен разговор, група или канал (и добавяне на хора към съществуващ): търсене на колеги
// (GET /people) → избор → POST /conversations. Сървърът пази правилата (кой с кого, видимост).

import { clear, h, $ } from '../dom.js';
import { errorText } from '../errors.js';
import { roleLabel } from '../format.js';
import { t } from '../i18n.js';
import { wsApi } from './api.js';
import { can } from './caps.js';
import { upsertConversation } from './model.js';
import { emit } from '../store.js';

let mode = { kind: 'create', onCreated: () => {} };
const chosen = new Map(); // id -> person
let timer = 0;

const typeValue = () => document.querySelector('input[name="nc-type"]:checked')?.value ?? 'DIRECT';

function paintChosen() {
  const ul = clear($('#nc-chosen'));
  for (const p of chosen.values()) {
    ul.append(
      h(
        'li',
        null,
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            'aria-label': t('nc.remove', { name: p.name }),
            onclick: () => {
              chosen.delete(p.id);
              paintChosen();
              void search();
            },
          },
          `${p.name} ×`,
        ),
      ),
    );
  }
}

async function search() {
  const ul = clear($('#nc-results'));
  try {
    const { people } = await wsApi.people($('#nc-search').value.trim());
    for (const p of people) {
      if (chosen.has(p.id)) continue;
      ul.append(
        h(
          'li',
          null,
          h(
            'button',
            {
              class: 'pick',
              type: 'button',
              onclick: () => {
                if (typeValue() === 'DIRECT' && mode.kind === 'create') chosen.clear();
                chosen.set(p.id, p);
                paintChosen();
                void search();
              },
            },
            h('span', null, p.name),
            h('span', { class: 'muted' }, roleLabel(p.role)),
          ),
        ),
      );
    }
    if (!ul.children.length) ul.append(h('li', { class: 'muted' }, t('nc.noResults')));
  } catch (err) {
    ul.append(h('li', { class: 'form-error' }, errorText(err)));
  }
}

function syncType() {
  const type = typeValue();
  const adding = mode.kind === 'add';
  $('#nc-types').hidden = adding;
  $('#nc-name-field').hidden = adding || type === 'DIRECT';
  $('#nc-vis-field').hidden = adding || type !== 'CHANNEL';
  $('#nc-title').textContent = adding ? t('conv.addPeople') : t('nc.title');
  $('#nc-submit').textContent = adding ? t('nc.add') : t('nc.create');
}

/** @param {{ type?: 'DIRECT'|'GROUP'|'CHANNEL', addTo?: string, onCreated: (id: string) => void }} opts */
export function openNewConversation({ type = 'DIRECT', addTo, onCreated }) {
  mode = { kind: addTo ? 'add' : 'create', addTo, onCreated };
  chosen.clear();
  $('#nc-error').hidden = true;
  $('#nc-search').value = '';
  $('#nc-name').value = '';
  $('#nc-vis').value = '';
  const channelOnly = type === 'CHANNEL';
  for (const r of document.querySelectorAll('input[name="nc-type"]')) {
    r.checked = r.value === type;
    r.closest('label').hidden = channelOnly ? r.value !== 'CHANNEL' : r.value === 'CHANNEL';
  }
  syncType();
  paintChosen();
  $('#dlg-newconv').showModal();
  void search();
  $('#nc-search').focus();
}

export function initNewConversation() {
  for (const r of document.querySelectorAll('input[name="nc-type"]'))
    r.addEventListener('change', syncType);
  $('#nc-search').addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => void search(), 250);
  });
  $('#nc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#nc-error');
    err.hidden = true;
    const ids = [...chosen.keys()];
    const type = typeValue();
    const name = $('#nc-name').value.trim();
    const submit = $('#nc-submit');
    // Двоен клик не създава две групи (сървърът обединява само DIRECT и канал с име).
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      let conv;
      if (mode.kind === 'add') {
        if (!ids.length) throw Object.assign(new Error('x'), { status: 400, code: 'nc_empty' });
        ({ conversation: conv } = await wsApi.addMembers(mode.addTo, ids));
      } else if (type === 'DIRECT') {
        if (ids.length !== 1)
          throw Object.assign(new Error('x'), { status: 400, code: 'nc_empty' });
        ({ conversation: conv } = await wsApi.create({ type, userId: ids[0] }));
      } else if (type === 'GROUP') {
        if (!ids.length) throw Object.assign(new Error('x'), { status: 400, code: 'nc_empty' });
        ({ conversation: conv } = await wsApi.create({
          type,
          userIds: ids,
          ...(name ? { name } : {}),
        }));
      } else {
        if (!name || !can('channel:create'))
          throw Object.assign(new Error('x'), { status: 400, code: 'nc_name' });
        const visibility = $('#nc-vis').value;
        ({ conversation: conv } = await wsApi.create({
          type,
          name,
          userIds: ids,
          ...(visibility ? { visibility } : {}),
        }));
      }
      upsertConversation({ ...conv, member: true, unread: conv.unread ?? 0 });
      emit('ws:convs');
      $('#dlg-newconv').close();
      mode.onCreated(conv.id);
    } catch (ex) {
      err.textContent =
        ex.code === 'nc_empty'
          ? t('nc.err.empty')
          : ex.code === 'nc_name'
            ? t('nc.err.name')
            : errorText(ex);
      err.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
}
