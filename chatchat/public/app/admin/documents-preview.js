// Преглед преди публикуване (§4.1 „anteprima pagina, estratti indicizzati e sorgenti“): страница
// по страница — извлечените парчета с раздела, componentRefs и кодовете за грешка, както ги вижда
// търсенето; оригиналният PDF се отваря през подписан адрес (5 мин., вързан към човека). Важи и за
// черновата — публичният визуализатор я крие, админският маршрут е само за kb:manage.

import { t } from '../i18n.js';
import { call } from './core.js';
import { button, clear, errText, failure, field, h, loading, select, toast } from './ui.js';

function tags(label, values, kind) {
  if (!values?.length) return null;
  return h(
    'p',
    { class: 'kb-tags' },
    h('span', { class: 'muted small' }, `${label}: `),
    ...values.map((v) => h('span', { class: `tag tag-${kind} mono` }, v)),
  );
}

function chunkView(c) {
  return h(
    'article',
    { class: 'kb-chunk' },
    h(
      'p',
      { class: 'kb-chunk-head muted small' },
      `#${c.ordinal + 1}`,
      c.section ? ` · ${c.section}` : '',
    ),
    h('p', { class: 'kb-text' }, c.text),
    tags(t('admin.kb.preview.components'), c.componentRefs, 'info'),
    tags(t('admin.kb.preview.errorCodes'), c.errorCodes, 'stop'),
  );
}

/**
 * Оригиналът — през подписания адрес на визуализатора (5 мин., вързан към човека; одитира се при
 * отваряне). Адресът се взима при клик и става връзка (нов раздел без popup блокиране).
 */
function originalControl(docId) {
  const holder = h('span', { class: 'kb-original' });
  const prepare = button(
    t('admin.kb.preview.original'),
    async () => {
      try {
        const meta = await call('GET', `/documents/${encodeURIComponent(docId)}/source`);
        if (!meta.source?.available || !meta.source.url) {
          toast(t('admin.kb.preview.noOriginal'), 'warn');
          return;
        }
        const link = h(
          'a',
          {
            href: meta.source.url,
            target: '_blank',
            rel: 'noopener',
            class: 'btn btn-secondary btn-sm',
          },
          t('admin.kb.preview.openOriginal'),
        );
        holder.replaceChildren(link, h('span', { class: 'hint' }, t('admin.kb.preview.linkTtl')));
        link.focus();
      } catch (err) {
        toast(errText(err), 'err');
      }
    },
    { small: true },
  );
  holder.append(prepare);
  return holder;
}

/** Блокът за преглед в детайла на документа: избор на страница → парчетата ѝ. */
export function previewBlock(detail) {
  const doc = detail.document;
  const out = h('div', { class: 'kb-preview-page', 'aria-live': 'polite' });
  const original = detail.source.available
    ? originalControl(doc.id)
    : h('p', { class: 'hint' }, t('admin.kb.preview.noOriginal'));
  if (detail.pages.length === 0) {
    return h(
      'div',
      { class: 'kb-preview' },
      h('p', { class: 'muted' }, t('admin.kb.preview.empty')),
      original,
    );
  }
  const pages = select(
    detail.pages.map((p) => ({
      value: String(p.page),
      label: t('admin.kb.preview.pageOption', {
        page: p.page,
        chunks: p.chunks,
        components: p.components.length,
      }),
    })),
    String(detail.pages[0].page),
  );
  let serial = 0;
  const load = async () => {
    const mine = ++serial;
    clear(out).append(loading());
    try {
      const res = await call(
        'GET',
        `/admin/documents/${encodeURIComponent(doc.id)}/pages/${encodeURIComponent(pages.value)}`,
      );
      if (mine !== serial) return;
      clear(out).append(...res.chunks.map(chunkView));
    } catch (err) {
      if (mine === serial) clear(out).append(failure(err, () => void load()));
    }
  };
  pages.addEventListener('change', () => void load());
  void load();
  return h(
    'div',
    { class: 'kb-preview' },
    h('div', { class: 'toolbar' }, field(t('admin.kb.preview.page'), pages), original),
    out,
  );
}
