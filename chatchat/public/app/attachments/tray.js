// Тавата за прикачване в полето на случая (§12.2): голям бутон „Снимай“, снимка от галерията и
// лог файл. Всеки файл се качва веднага (с напредък), а към въпроса се привързва с `attachmentIds`
// чак при изпращане. Само CLEAN файлове получават id — заразеният/непроверен остава с грешка.

import { announce, clear, h } from '../dom.js';
import { errorText } from '../errors.js';
import { fmtSize } from '../format.js';
import { t } from '../i18n.js';
import { MAX_BYTES, uploadAttachment } from './upload.js';

export const MAX_PER_MESSAGE = 5;
const LOG_ACCEPT = '.log,.txt,.csv,.json,text/plain,text/csv,application/json';
/** След тези грешки повторен опит не помага — файлът трябва да се махне. */
const FINAL = new Set([
  'attachment_infected',
  'unsupported_type',
  'payload_too_large',
  'case_closed',
  'invalid_attachment',
]);

/** Умалена копия като data: URL (CSP позволява data:, не blob:). null, ако браузърът не я чете. */
async function thumbOf(file) {
  try {
    const bmp = await createImageBitmap(file);
    const size = 96;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const k = Math.max(size / bmp.width, size / bmp.height);
    const w = bmp.width * k;
    const hgt = bmp.height * k;
    ctx.drawImage(bmp, (size - w) / 2, (size - hgt) / 2, w, hgt);
    bmp.close?.();
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}

/**
 * @param {{ getCaseId: () => string | null, onChange?: () => void }} opts
 */
export function createTray({ getCaseId, onChange }) {
  /** @type {Array<{key:number, file:File, kind:'PHOTO'|'LOG', status:'uploading'|'ready'|'error', progress:number, id:string|null, error:string, final:boolean, thumb:string|null, abort:(()=>void)|null}>} */
  let items = [];
  let seq = 0;
  let disabled = false;

  const list = h('ul', { class: 'tray-list', 'aria-label': t('att.listLabel') });
  const notice = h('p', { class: 'hint tray-notice' }, t('att.aiNotice'));
  const limitNote = h(
    'p',
    { class: 'form-error', role: 'alert', hidden: true },
    t('att.limit', { max: MAX_PER_MESSAGE }),
  );

  const input = (accept, capture) =>
    h('input', {
      type: 'file',
      class: 'sr-only',
      tabindex: '-1',
      accept,
      capture: capture ?? null,
      'aria-hidden': 'true',
      onchange: (e) => {
        const kind = e.currentTarget.dataset.kind;
        for (const file of e.currentTarget.files ?? []) add(file, kind);
        e.currentTarget.value = '';
      },
    });
  const camera = input('image/*', 'environment');
  camera.dataset.kind = 'PHOTO';
  const gallery = input('image/*');
  gallery.dataset.kind = 'PHOTO';
  const logs = input(LOG_ACCEPT);
  logs.dataset.kind = 'LOG';

  const btnPhoto = h(
    'button',
    { class: 'btn btn-primary btn-photo', type: 'button', onclick: () => camera.click() },
    t('att.photo'),
  );
  const btnGallery = h(
    'button',
    { class: 'btn btn-secondary', type: 'button', onclick: () => gallery.click() },
    t('att.gallery'),
  );
  const btnLog = h(
    'button',
    { class: 'btn btn-secondary', type: 'button', onclick: () => logs.click() },
    t('att.log'),
  );

  const el = h(
    'div',
    { class: 'tray' },
    h('div', { class: 'tray-actions' }, btnPhoto, btnGallery, btnLog),
    notice,
    limitNote,
    list,
    camera,
    gallery,
    logs,
  );

  const changed = () => {
    render();
    onChange?.();
  };

  function render() {
    clear(list);
    const active = items.filter((i) => i.status !== 'error').length;
    const full = active >= MAX_PER_MESSAGE;
    for (const b of [btnPhoto, btnGallery, btnLog]) b.disabled = disabled || full;
    limitNote.hidden = !full;
    list.hidden = items.length === 0;
    for (const item of items) {
      const statusText = () =>
        item.status === 'uploading'
          ? t('att.uploading', { pct: Math.round(item.progress * 100) })
          : item.status === 'ready'
            ? t('att.ready')
            : item.error;
      item.statusEl = h('span', null, statusText());
      item.statusText = statusText;
      item.bar =
        item.status === 'uploading'
          ? h('progress', {
              max: '1',
              value: String(item.progress),
              'aria-label': t('att.progressLabel', { name: item.file.name }),
            })
          : null;
      list.append(
        h(
          'li',
          { class: `tray-item is-${item.status}` },
          item.thumb
            ? h('img', { class: 'tray-thumb', src: item.thumb, alt: '', width: '48', height: '48' })
            : h(
                'span',
                { class: 'tray-thumb tray-thumb-doc', 'aria-hidden': 'true' },
                item.kind === 'PHOTO' ? 'IMG' : 'LOG',
              ),
          h(
            'div',
            { class: 'tray-main' },
            h(
              'p',
              { class: 'tray-name' },
              item.file.name || t(item.kind === 'PHOTO' ? 'att.kind.PHOTO' : 'att.kind.LOG'),
            ),
            h(
              'p',
              { class: `tray-status${item.status === 'error' ? ' form-error' : ''}` },
              `${t(`att.kind.${item.kind}`)} · ${fmtSize(item.file.size)} · `,
              item.statusEl,
            ),
            item.bar,
          ),
          h(
            'div',
            { class: 'tray-btns' },
            item.status === 'error' && !item.final
              ? h(
                  'button',
                  { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => start(item) },
                  t('att.retry'),
                )
              : null,
            h(
              'button',
              {
                class: 'btn btn-quiet btn-sm',
                type: 'button',
                'aria-label': t('att.remove', { name: item.file.name }),
                onclick: () => remove(item),
              },
              t('att.removeShort'),
            ),
          ),
        ),
      );
    }
  }

  function remove(item) {
    item.abort?.();
    items = items.filter((i) => i !== item);
    changed();
  }

  function fail(item, err) {
    item.status = 'error';
    item.abort = null;
    item.final = FINAL.has(err?.code);
    item.error = err?.code === 'aborted' ? t('att.aborted') : errorText(err);
    announce(`${item.file.name}: ${item.error}`);
    changed();
  }

  function start(item) {
    const caseId = getCaseId();
    if (!caseId) return fail(item, { code: 'not_found' });
    item.status = 'uploading';
    item.progress = 0;
    item.error = '';
    const job = uploadAttachment(caseId, item.kind, item.file, {
      onProgress: (ratio) => {
        item.progress = ratio;
        if (item.bar) item.bar.value = ratio;
        if (item.statusEl) item.statusEl.textContent = item.statusText();
      },
    });
    item.abort = job.abort;
    changed();
    job.promise.then(
      (att) => {
        if (!items.includes(item)) return;
        item.status = 'ready';
        item.id = att.id;
        item.abort = null;
        announce(t('att.readyAnnounce', { name: item.file.name }));
        changed();
      },
      (err) => {
        if (items.includes(item)) fail(item, err);
      },
    );
  }

  function add(file, kind) {
    if (items.filter((i) => i.status !== 'error').length >= MAX_PER_MESSAGE) {
      limitNote.hidden = false;
      return;
    }
    const item = {
      key: ++seq,
      file,
      kind,
      status: 'uploading',
      progress: 0,
      id: null,
      error: '',
      final: false,
      thumb: null,
      abort: null,
    };
    items.push(item);
    if (file.size > MAX_BYTES[kind]) {
      return fail(item, { code: 'payload_too_large' });
    }
    if (kind === 'PHOTO') {
      void thumbOf(file).then((src) => {
        item.thumb = src;
        if (items.includes(item)) render();
      });
    }
    start(item);
  }

  render();
  return {
    el,
    /** Идентификаторите на готовите (CLEAN) файлове — за `attachmentIds`. */
    ids: () => items.filter((i) => i.status === 'ready').map((i) => i.id),
    uploading: () => items.some((i) => i.status === 'uploading'),
    hasFailed: () => items.some((i) => i.status === 'error'),
    count: () => items.length,
    /** След изпращане: готовите са привързани към съобщението, грешните остават за преглед. */
    clearSent: () => {
      items = items.filter((i) => i.status !== 'ready');
      changed();
    },
    reset: () => {
      for (const i of items) i.abort?.();
      items = [];
      changed();
    },
    setDisabled: (value) => {
      disabled = value;
      render();
    },
    refreshLabels: () => {
      btnPhoto.textContent = t('att.photo');
      btnGallery.textContent = t('att.gallery');
      btnLog.textContent = t('att.log');
      notice.textContent = t('att.aiNotice');
      list.setAttribute('aria-label', t('att.listLabel'));
      limitNote.textContent = t('att.limit', { max: MAX_PER_MESSAGE });
      render();
    },
  };
}
