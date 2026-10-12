import { api } from './api.js';
import { append, clear, h, $ } from './dom.js';
import { errorText } from './errors.js';
import { t } from './i18n.js';

/** Отваря страницата на документа в диалог (GET /documents/:id/pages/:page). */
export async function openSource(ev) {
  const dlg = $('#dlg-doc');
  const body = $('#doc-body');
  clear(body).append(h('p', { class: 'muted' }, t('doc.loading')));
  if (!dlg.open) dlg.showModal();
  try {
    const data = await api(
      'GET',
      `/documents/${encodeURIComponent(ev.documentId)}/pages/${encodeURIComponent(ev.page)}`,
    );
    const doc = data.document ?? {};
    const chunks = Array.isArray(data.chunks) ? data.chunks : [];
    append(clear(body), [
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
      chunks.length
        ? chunks.map((c) =>
            h(
              'section',
              { class: 'doc-chunk' },
              c.section ? h('h3', { class: 'blk-title' }, String(c.section)) : null,
              h('p', { class: 'doc-text' }, String(c.text ?? '')),
            ),
          )
        : h('p', { class: 'muted' }, t('doc.empty')),
    ]);
  } catch (err) {
    clear(body).append(h('p', { class: 'form-error' }, `${t('doc.error')} ${errorText(err)}`));
  }
}
