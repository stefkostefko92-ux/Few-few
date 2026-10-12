// Файловете в разговор (§12.1 „Allegati chat“): тавата в полето за съобщение и списъкът във
// всяко съобщение. Всеки файл се качва веднага (сурово тяло, без multipart) към
// POST /conversations/:id/attachments — типът се определя от сървъра по съдържанието, след
// антивирус; към съобщението се привързва с `attachmentIds` чак при изпращане. Байтовете се
// отварят САМО през краткотраен подписан адрес (GET /attachments/:id/url → 5 мин.).

import { ApiError, api } from '../api.js';
import { $, announce, clear, h } from '../dom.js';
import { errorText } from '../errors.js';
import { fmtSize } from '../format.js';
import { t } from '../i18n.js';
import { state } from '../store.js';

export const MAX_FILES = 5;
const MAX_BYTES = { PHOTO: 10 * 1024 * 1024, LOG: 2 * 1024 * 1024, DOCUMENT: 50 * 1024 * 1024 };
const ACCEPT =
  'image/*,application/pdf,.pdf,.log,.txt,.csv,.json,text/plain,text/csv,application/json';

/** Видът, който пращаме на сървъра — той пак проверява по магическите байтове. */
export function kindOf(file) {
  if (file.type?.startsWith('image/')) return 'PHOTO';
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '')) return 'DOCUMENT';
  return 'LOG';
}

function uploadFile(convId, kind, file, onProgress) {
  const xhr = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    const q = new URLSearchParams({ kind, name: file.name || 'file' });
    xhr.open('POST', `/api/v1/conversations/${encodeURIComponent(convId)}/attachments?${q}`);
    xhr.responseType = 'text';
    xhr.timeout = 180000;
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    if (state.csrf) xhr.setRequestHeader('x-csrf-token', state.csrf);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onerror = () => reject(new ApiError(0, 'network'));
    xhr.ontimeout = () => reject(new ApiError(0, 'network'));
    xhr.onabort = () => reject(new ApiError(0, 'aborted'));
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status === 201 && data?.attachment) resolve(data.attachment);
      else reject(new ApiError(xhr.status, data?.code, data?.error));
    };
    xhr.send(file);
  });
  return { promise, abort: () => xhr.abort() };
}

/**
 * @param {{ convId: string, onChange?: () => void }} opts
 */
export function createFileTray({ convId, onChange }) {
  let items = [];
  let seq = 0;
  const list = h('ul', { class: 'tray-list', 'aria-label': t('ws.files.list') });
  const limit = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const input = h('input', {
    type: 'file',
    class: 'sr-only',
    tabindex: '-1',
    multiple: true,
    accept: ACCEPT,
    'aria-hidden': 'true',
    onchange: (e) => {
      for (const file of e.currentTarget.files ?? []) add(file);
      e.currentTarget.value = '';
    },
  });
  const button = h(
    'button',
    { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => input.click() },
    t('ws.files.attach'),
  );
  const hint = h('p', { class: 'hint' }, t('ws.files.hint', { max: MAX_FILES }));
  const el = h(
    'div',
    { class: 'conv-files' },
    h('div', { class: 'btn-row' }, button),
    input,
    hint,
    list,
    limit,
  );
  const changed = () => {
    render();
    onChange?.();
  };

  function add(file) {
    if (items.length >= MAX_FILES) {
      limit.textContent = t('ws.files.limit', { max: MAX_FILES });
      limit.hidden = false;
      return;
    }
    limit.hidden = true;
    const kind = kindOf(file);
    const item = {
      key: (seq += 1),
      file,
      kind,
      status: 'uploading',
      progress: 0,
      id: null,
      error: '',
    };
    items.push(item);
    if (file.size > MAX_BYTES[kind]) {
      item.status = 'error';
      item.error = errorText(new ApiError(413, 'payload_too_large'));
      return changed();
    }
    const job = uploadFile(convId, kind, file, (ratio) => {
      item.progress = ratio;
      render();
    });
    item.abort = job.abort;
    job.promise.then(
      (a) => {
        item.status = 'ready';
        item.id = a.id;
        item.view = a;
        announce(t('ws.files.readyAnnounce', { name: file.name }));
        changed();
      },
      (err) => {
        item.status = 'error';
        item.error = err?.code === 'aborted' ? '' : errorText(err);
        changed();
      },
    );
    changed();
  }

  function remove(item) {
    item.abort?.();
    items = items.filter((x) => x !== item);
    limit.hidden = true;
    changed();
  }

  function render() {
    clear(list);
    for (const item of items) {
      const status =
        item.status === 'uploading'
          ? t('ws.files.uploading', { pct: Math.round(item.progress * 100) })
          : item.status === 'ready'
            ? t('ws.files.ready')
            : item.error;
      list.append(
        h(
          'li',
          { class: `tray-item${item.status === 'error' ? ' is-error' : ''}` },
          h(
            'span',
            { class: 'tray-thumb', 'aria-hidden': 'true' },
            t(`ws.files.kind.${item.kind}`),
          ),
          h(
            'div',
            null,
            h('p', { class: 'tray-name' }, `${item.file.name} · ${fmtSize(item.file.size)}`),
            h(
              'p',
              { class: 'tray-status', role: item.status === 'error' ? 'alert' : null },
              status,
            ),
          ),
          h(
            'button',
            {
              class: 'btn btn-quiet btn-sm',
              type: 'button',
              'aria-label': t('ws.files.remove', { name: item.file.name }),
              onclick: () => remove(item),
            },
            t('ws.files.removeShort'),
          ),
        ),
      );
    }
    list.hidden = items.length === 0;
    hint.hidden = items.length === 0;
  }
  render();

  return {
    el,
    /** null → готово (ids + изгледите); иначе текстът защо не може да се изпрати още. */
    problem: () =>
      items.some((x) => x.status === 'uploading')
        ? t('ws.files.wait')
        : items.some((x) => x.status === 'error')
          ? t('ws.files.failedBlock')
          : null,
    ready: () => items.filter((x) => x.status === 'ready').map((x) => x.view),
    reset: () => {
      items = [];
      limit.hidden = true;
      render();
    },
    relabel: () => {
      button.textContent = t('ws.files.attach');
      hint.textContent = t('ws.files.hint', { max: MAX_FILES });
      list.setAttribute('aria-label', t('ws.files.list'));
      render();
    },
    destroy: () => items.forEach((x) => x.abort?.()),
  };
}

/** Файловете в съобщение: бутон „Отвори“ за всеки (само CLEAN идват от сървъра). */
export function renderConvFiles(files) {
  const items = Array.isArray(files) ? files : [];
  if (items.length === 0) return null;
  return h(
    'ul',
    { class: 'att-list', 'aria-label': t('ws.files.inMessage') },
    items.map((a) =>
      h(
        'li',
        null,
        h(
          'button',
          {
            class: 'btn btn-secondary btn-sm att-chip',
            type: 'button',
            onclick: () => void openConvFile(a),
          },
          h('span', { class: 'att-kind' }, t(`ws.files.kind.${a.kind}`)),
          ' ',
          h('span', { class: 'att-name' }, String(a.originalName ?? '')),
          h('span', { class: 'sr-only' }, ` — ${t('ws.files.open')}`),
        ),
      ),
    ),
  );
}

/** Прегледът: снимката — вътре (data:/self по CSP), PDF/лог — сваляне с подписан адрес. */
export async function openConvFile(a) {
  const dlg = $('#dlg-file');
  const body = $('#file-body');
  $('#file-title').textContent = String(a.originalName ?? t(`ws.files.kind.${a.kind}`));
  clear(body).append(h('p', { class: 'muted' }, t('att.loading')));
  if (!dlg.open) dlg.showModal();
  try {
    const { url } = await api('GET', `/attachments/${encodeURIComponent(a.id)}/url`);
    const safe = typeof url === 'string' && url.startsWith('/api/v1/files/') ? url : null;
    if (!safe) throw new ApiError(0, 'network');
    const download = h(
      'a',
      { class: 'btn btn-secondary', href: safe, download: String(a.originalName ?? '') },
      t('att.download'),
    );
    if (a.kind === 'PHOTO') {
      const img = h('img', {
        class: 'file-img',
        src: safe,
        alt: t('att.photoAlt', { name: String(a.originalName ?? '') }),
      });
      clear(body).append(img, download);
    } else {
      clear(body).append(h('p', null, t('ws.files.downloadHint')), download);
    }
  } catch (err) {
    clear(body).append(h('p', { class: 'form-error', role: 'alert' }, errorText(err)));
  }
}
