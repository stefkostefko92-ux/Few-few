// Прикачените файлове в съобщение и прегледът им. Байтовете идват САМО през краткотраен подписан
// адрес (GET /attachments/:id/url → 5 мин., вързан към човека); адресът не се пази.

import { api } from '../api.js';
import { $, clear, h } from '../dom.js';
import { errorText } from '../errors.js';
import { t } from '../i18n.js';

/** Списък от бутони „Отвори файла“ към съобщение (само CLEAN файлове идват от сървъра). */
export function renderAttachments(list) {
  const items = Array.isArray(list) ? list : [];
  if (items.length === 0) return null;
  return h(
    'ul',
    { class: 'att-list', 'aria-label': t('att.inMessage') },
    items.map((a) =>
      h(
        'li',
        null,
        h(
          'button',
          {
            class: 'btn btn-secondary btn-sm att-chip',
            type: 'button',
            onclick: () => openAttachment(a),
          },
          h(
            'span',
            { class: 'att-kind', 'aria-hidden': 'true' },
            a.kind === 'PHOTO' ? 'IMG' : 'LOG',
          ),
          h('span', { class: 'att-name' }, String(a.originalName ?? t(`att.kind.${a.kind}`))),
          h('span', { class: 'sr-only' }, ` — ${t(`att.kind.${a.kind}`)}. ${t('att.open')}`),
        ),
      ),
    ),
  );
}

export async function openAttachment(a) {
  const dlg = $('#dlg-file');
  const body = $('#file-body');
  $('#file-title').textContent = String(a.originalName ?? t(`att.kind.${a.kind}`));
  clear(body).append(h('p', { class: 'muted' }, t('att.loading')));
  if (!dlg.open) dlg.showModal();
  try {
    const { url } = await api('GET', `/attachments/${encodeURIComponent(a.id)}/url`);
    const safe = typeof url === 'string' && url.startsWith('/api/v1/files/') ? url : null;
    if (!safe) throw new Error('url');
    const download = h(
      'a',
      { class: 'btn btn-secondary', href: safe, download: String(a.originalName ?? '') },
      t('att.download'),
    );
    if (a.kind === 'PHOTO') {
      const fallback = h(
        'p',
        { class: 'form-error', role: 'alert', hidden: true },
        t('att.noPreview'),
      );
      const img = h('img', {
        class: 'file-img',
        src: safe,
        alt: t('att.photoAlt', { name: String(a.originalName ?? '') }),
        onerror: () => {
          img.hidden = true;
          fallback.hidden = false;
        },
      });
      clear(body).append(img, fallback, h('p', { class: 'hint' }, t('att.aiNotice')), download);
    } else {
      clear(body).append(h('p', null, t('att.logHint')), download);
    }
  } catch (err) {
    clear(body).append(
      h(
        'p',
        { class: 'form-error', role: 'alert' },
        err?.status ? errorText(err) : t('err.server'),
      ),
    );
  }
}
