// Един файл в тавата за прикачване (`tray.js`): умаленото копие и редът с име, вид, размер,
// статус, напредък и бутоните „Опитай пак“ / „Махни“.

import { h } from '../dom.js';
import { fmtSize } from '../format.js';
import { t } from '../i18n.js';

/** Умалена копия като data: URL (CSP позволява data:, не blob:). null, ако браузърът не я чете. */
export async function thumbOf(file) {
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
 * Редът на файла. Слага върху `item` `statusEl`, `statusText` и `bar` — напредъкът на качването
 * ги обновява на място, без да рисува тавата наново.
 * @param {{ onRetry: () => void, onRemove: () => void }} actions
 */
export function trayItem(item, { onRetry, onRemove }) {
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
  return h(
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
            { class: 'btn btn-secondary btn-sm', type: 'button', onclick: onRetry },
            t('att.retry'),
          )
        : null,
      h(
        'button',
        {
          class: 'btn btn-quiet btn-sm',
          type: 'button',
          'aria-label': t('att.remove', { name: item.file.name }),
          onclick: onRemove,
        },
        t('att.removeShort'),
      ),
    ),
  );
}
