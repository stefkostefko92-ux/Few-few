// Визуализатор на схеми (§9.2): оригиналната страница на PDF-а (pdf.js от собствения домейн) с
// мащаб/местене, подчертани цитирани компоненти и страничен панел „използвано в диагнозата“.
// Документ без оригинален PDF (въведен като JSON) или файл, който не се чете → текстът на страницата.
// Детайлите живеят в viewer/*.js; тук е само редът: метаданни → страница → панел.

import { api } from './api.js';
import { arr } from './answer/util.js';
import { append, clear, h, $ } from './dom.js';
import { errorText } from './errors.js';
import { t } from './i18n.js';
import { citedComponentRefs } from './viewer/highlight.js';
import { createPageView } from './viewer/page-view.js';
import { buildPanel } from './viewer/panel.js';
import { openPdf } from './viewer/pdf.js';
import { buildToolbar } from './viewer/toolbar.js';
import { fetchPageText, renderChunks } from './viewer/text-page.js';

let teardown = null;
// Всяко отваряне получава номер: по-старо, което още зарежда, не пипа диалога и не унищожава
// документа на по-новото (смяна на ревизия/страница, Esc по време на голяма схема).
let openGen = 0;

function stop() {
  teardown?.();
  teardown = null;
}

/** Отваря страницата на документа. `answer` е payload-ът на AI отговора (за панела и маркировките). */
export async function openSource(ev, answer = null) {
  const dlg = $('#dlg-doc');
  const body = $('#doc-body');
  stop();
  const gen = ++openGen;
  const alive = () => gen === openGen && dlg.open;
  clear(body).append(h('p', { class: 'muted' }, t('doc.loading')));
  if (!dlg.open) dlg.showModal();
  dlg.addEventListener('close', stop, { once: true });
  try {
    const meta = await api('GET', `/documents/${encodeURIComponent(ev.documentId)}/source`);
    if (!alive()) return;
    const view = h('div', { class: 'vw' });
    const main = h('div', { class: 'vw-main' });
    const side = h('aside', { class: 'vw-side', 'aria-label': t('viewer.side') });
    append(clear(body), [identity(meta, ev), append(view, [main, side])]);
    const opts = { ev, answer, meta, main, side, alive };
    if (meta.source?.available) {
      try {
        await pdfMode(opts);
        return;
      } catch {
        // Затворено/сменено междувременно → тишина: новото отваряне си държи диалога.
        if (!alive()) return;
        stop();
        clear(main);
        opts.notice = t('viewer.pdfError');
      }
    } else {
      opts.notice = t('viewer.noOriginal');
    }
    await textMode(opts);
  } catch (err) {
    if (!alive()) return;
    clear(body).append(h('p', { class: 'form-error' }, `${t('doc.error')} ${errorText(err)}`));
  }
}

function identity(meta, ev) {
  const d = meta.document;
  return h(
    'div',
    { class: 'doc-id' },
    h('p', { class: 'doc-code mono' }, String(d.code ?? ev.documentCode ?? '')),
    h('p', { class: 'doc-title' }, String(d.title ?? ev.documentTitle ?? '')),
  );
}

function sidePanel({ side, meta, answer, onOpen }, state) {
  clear(side);
  append(
    side,
    buildPanel(
      { meta, answer, ...state },
      {
        gotoPage: state.goto,
        openRevision: (id) => onOpen({ documentId: id, page: state.page }),
      },
    ),
  );
}

/** Извлеченият текст на страницата — разгъва се по желание (екранен четец, търсене с Ctrl+F). */
function textDetails(documentId, page) {
  const box = h('div', { class: 'vw-text-body' });
  const det = h('details', { class: 'vw-text' }, h('summary', null, t('viewer.pageText')), box);
  det.addEventListener('toggle', async () => {
    if (!det.open || box.childElementCount) return;
    box.append(h('p', { class: 'muted' }, t('doc.loading')));
    try {
      clear(box).append(renderChunks(await fetchPageText(documentId, page)));
    } catch {
      clear(box).append(h('p', { class: 'muted' }, t('doc.empty')));
    }
  });
  return det;
}

async function pdfMode({ ev, answer, meta, main, side, alive }) {
  // Teardown-ът е зает ПРЕДИ свалянето: Esc по време на голяма схема прекъсва и fetch-а, и разбора.
  const ctrl = new AbortController();
  teardown = () => ctrl.abort();
  const { lib, pdf, destroy } = await openPdf(meta.source.url, ctrl.signal);
  if (!alive()) {
    destroy();
    return;
  }
  teardown = destroy;
  const onOpen = (e) => void openSource({ ...ev, ...e, quote: undefined }, answer);
  const hint = h('p', { id: 'vw-keys', class: 'vw-keys muted small' }, t('viewer.keys'));
  const viewport = h('div', {
    class: 'vw-viewport',
    tabindex: '0',
    role: 'group',
    'aria-label': t('viewer.area'),
    'aria-describedby': 'vw-keys',
  });
  let pageNum = 1;
  let marks = [];
  let goSeq = 0;
  let go = () => undefined;
  const bar = buildToolbar({
    prev: () => go(pageNum - 1),
    next: () => go(pageNum + 1),
    zoomIn: () => pv.zoomIn(),
    zoomOut: () => pv.zoomOut(),
    fit: () => pv.fit(),
    mark: () => pv.nextMark(),
  });
  const pv = createPageView({
    viewport,
    pdf,
    lib,
    onPage: (n) => {
      pageNum = n;
      bar.setPage(n, pdf.numPages);
    },
    onBusy: (on) => {
      bar.setBusy(on);
      viewport.setAttribute('aria-busy', String(on));
    },
    onScale: (s) => bar.setZoom(s),
    onGoto: (n) => go(n),
  });
  append(clear(main), [bar.el, viewport, hint]);
  teardown = () => {
    pv.destroy();
    destroy();
  };

  go = async (n) => {
    // Два бързи клика: печели последният, не по-бавната заявка.
    const mine = ++goSeq;
    const target = Math.min(pdf.numPages, Math.max(1, n));
    const onPage = arr(answer?.evidence).filter(
      (e) => e.documentId === meta.document.id && e.page === target,
    );
    let refs = [];
    if (onPage.length) {
      try {
        refs = citedComponentRefs(
          arr((await fetchPageText(meta.document.id, target)).chunks),
          onPage,
        );
      } catch {
        refs = []; // страница без текст — няма какво да се търси, остава оригиналът
      }
    }
    if (mine !== goSeq || !alive()) return;
    const result = await pv.show(target, refs);
    if (mine !== goSeq || !alive()) return;
    marks = refs.map((ref) => ({ ref, found: result.found.has(ref) }));
    bar.setMarks(pv.hasMarks());
    sidePanel(
      { side, meta, answer, onOpen },
      { page: target, pageCount: pdf.numPages, marks, goto: go },
    );
    side.append(textDetails(meta.document.id, target));
  };
  await go(Number(ev.page) || 1);
}

async function textMode({ ev, answer, meta, main, side, notice, alive }) {
  const page = Number(ev.page) || 1;
  const pages = arr(meta.textPages);
  const onOpen = (e) => void openSource({ ...ev, ...e, quote: undefined }, answer);
  clear(main).append(h('p', { class: 'notice' }, notice));
  try {
    const data = await fetchPageText(meta.document.id, page);
    if (!alive()) return;
    append(main, [
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
    main.append(h('p', { class: 'form-error' }, `${t('doc.error')} ${errorText(err)}`));
  }
  sidePanel(
    { side, meta, answer, onOpen },
    {
      page,
      pageCount: pages.length ? Math.max(...pages) : page,
      marks: [],
      goto: (n) => void openSource({ ...ev, page: n, quote: undefined }, answer),
    },
  );
}
