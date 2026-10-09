// Текстът на страницата (GET /documents/:id/pages/:page) — резервният вариант, когато документът няма
// оригинален PDF (въведен като JSON) или файлът не може да се покаже, и разгъваемият „извлечен текст“.

import { api } from '../api.js';
import { append, clear, h } from '../dom.js';
import { errorText } from '../errors.js';
import { t } from '../i18n.js';

export function fetchPageText(documentId, page) {
  return api(
    'GET',
    `/documents/${encodeURIComponent(documentId)}/pages/${encodeURIComponent(page)}`,
  );
}

export function renderChunks(data) {
  const chunks = Array.isArray(data?.chunks) ? data.chunks : [];
  return chunks.length
    ? chunks.map((c) =>
        h(
          'section',
          { class: 'doc-chunk' },
          c.section ? h('h3', { class: 'blk-title' }, String(c.section)) : null,
          h('p', { class: 'doc-text' }, String(c.text ?? '')),
        ),
      )
    : h('p', { class: 'muted' }, t('doc.empty'));
}

/** Цитатът от отговора + текстът на страницата в `body` (без оригинал). */
export async function renderTextOnly(body, ev, notice) {
  clear(body).append(h('p', { class: 'muted' }, t('doc.loading')));
  try {
    const data = await fetchPageText(ev.documentId, ev.page);
    const doc = data.document ?? {};
    append(clear(body), [
      notice ? h('p', { class: 'notice' }, notice) : null,
      h(
        'div',
        { class: 'doc-id' },
        h('p', { class: 'doc-code mono' }, String(doc.code ?? ev.documentCode ?? '')),
        h('p', { class: 'doc-title' }, String(doc.title ?? ev.documentTitle ?? '')),
        h(
          'p',
          { class: 'muted' },
          `${t('ans.rev')} ${String(doc.revision ?? ev.revision ?? '')} · ${t('ans.page')} ${String(data.page ?? ev.page)}`,
        ),
      ),
      ev.quote
        ? h(
            'div',
            { class: 'doc-quote' },
            h('p', { class: 'sub' }, t('doc.quote')),
            h('blockquote', { class: 'quote' }, String(ev.quote)),
          )
        : null,
      renderChunks(data),
    ]);
  } catch (err) {
    clear(body).append(h('p', { class: 'form-error' }, `${t('doc.error')} ${errorText(err)}`));
  }
}
