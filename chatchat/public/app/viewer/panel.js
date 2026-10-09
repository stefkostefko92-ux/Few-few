// Страничният панел на визуализатора (§9.2): пътека страница → документ → ревизия → продукт,
// „използвано в диагнозата“ (доказателствата E… за този документ), маркираните компоненти и
// наблюденията по снимка — отделно и допълващо, без връзка с позиции в схемата.

import { arr, str } from '../answer/util.js';
import { photoItem } from '../answer/photos.js';
import { h } from '../dom.js';
import { t } from '../i18n.js';

/** Къде в отговора е използвано доказателството: причини и стъпки, които го цитират. */
export function usedIn(answer, ref) {
  const out = [];
  arr(answer?.causes).forEach((c, i) => {
    if (arr(c.evidenceRefs).includes(ref)) out.push(t('viewer.inCause', { n: i + 1 }));
  });
  for (const c of arr(answer?.checks)) {
    if (arr(c.evidenceRefs).includes(ref)) out.push(t('viewer.inStep', { n: c.step }));
  }
  return out;
}

function trail(meta, page, pageCount, onOpenRevision) {
  const d = meta.document;
  const others = arr(meta.revisions).filter((r) => !r.current);
  const products = arr(meta.products);
  return h(
    'section',
    { class: 'vw-sec' },
    h('h3', { class: 'blk-title' }, t('viewer.trail')),
    h(
      'dl',
      { class: 'vw-trail' },
      h('dt', null, t('viewer.product')),
      h(
        'dd',
        null,
        products.length
          ? h(
              'ul',
              { class: 'vw-list' },
              products.map((p) => {
                const fw = p.fwMin || p.fwMax ? ` · FW ${str(p.fwMin)}–${str(p.fwMax)}` : '';
                const hw = p.hwRevision ? ` · HW ${str(p.hwRevision)}` : '';
                return h('li', null, h('strong', { class: 'mono' }, str(p.model)), hw, fw);
              }),
            )
          : t('viewer.noProduct'),
      ),
      h('dt', null, t('viewer.document')),
      h('dd', null, h('strong', { class: 'mono' }, str(d.code)), ` ${str(d.title)}`),
      h('dt', null, t('viewer.revision')),
      h(
        'dd',
        null,
        `${str(d.revision)} (${t(`admin.status.${str(d.status)}`)})`,
        others.length
          ? h(
              'span',
              { class: 'vw-revs' },
              others.map((r) =>
                h(
                  'button',
                  {
                    class: 'btn btn-secondary btn-sm',
                    type: 'button',
                    onclick: () => onOpenRevision(r.id),
                  },
                  `${t('viewer.openRevision')} ${str(r.revision)} (${t(`admin.status.${str(r.status)}`)})`,
                ),
              ),
            )
          : null,
      ),
      h('dt', null, t('viewer.page')),
      h('dd', null, t('viewer.pageOf', { n: page, total: pageCount })),
    ),
  );
}

function evidenceCard(e, answer) {
  const where = usedIn(answer, e.ref);
  return h(
    'li',
    { class: 'vw-ev' },
    h(
      'p',
      null,
      h('span', { class: 'ref-badge ref-badge-static' }, str(e.ref)),
      e.section ? ` ${str(e.section)}` : '',
    ),
    e.quote ? h('blockquote', { class: 'quote' }, str(e.quote)) : null,
    where.length
      ? h('p', { class: 'small' }, `${t('viewer.usedIn')}: `, where.join(' · '))
      : h('p', { class: 'small muted' }, t('viewer.usedNowhere')),
  );
}

function used(meta, page, answer, goto) {
  const mine = arr(answer?.evidence).filter((e) => e.documentId === meta.document.id);
  const here = mine.filter((e) => e.page === page);
  const elsewhere = mine.filter((e) => e.page !== page && e.page != null);
  return h(
    'section',
    { class: 'vw-sec' },
    h('h3', { class: 'blk-title' }, t('viewer.used')),
    here.length
      ? h(
          'ul',
          { class: 'vw-list vw-evs' },
          here.map((e) => evidenceCard(e, answer)),
        )
      : h('p', { class: 'muted small' }, t('viewer.usedNone')),
    elsewhere.length
      ? h(
          'div',
          { class: 'vw-other' },
          h('p', { class: 'small' }, t('viewer.otherPages')),
          h(
            'div',
            { class: 'vw-chips' },
            elsewhere.map((e) =>
              h(
                'button',
                {
                  class: 'btn btn-secondary btn-sm',
                  type: 'button',
                  onclick: () => goto(e.page),
                },
                `${str(e.ref)} · ${t('ans.page')} ${e.page}`,
              ),
            ),
          ),
        )
      : null,
  );
}

function marksSection(marks) {
  if (!marks.length) return null;
  return h(
    'section',
    { class: 'vw-sec' },
    h('h3', { class: 'blk-title' }, t('viewer.marks')),
    h(
      'ul',
      { class: 'vw-list vw-marks-list' },
      marks.map((m) =>
        h(
          'li',
          null,
          h('span', { class: `vw-key${m.found ? ' is-found' : ''}`, 'aria-hidden': 'true' }),
          h('strong', { class: 'mono' }, str(m.ref)),
          ` — ${m.found ? t('viewer.markFound') : t('viewer.markListOnly')}`,
        ),
      ),
    ),
  );
}

function photosSection(answer) {
  const photos = arr(answer?.photos);
  if (!photos.length) return null;
  return h(
    'section',
    { class: 'vw-sec vw-photos' },
    h('h3', { class: 'blk-title' }, t('viewer.photos')),
    h('p', { class: 'muted small' }, t('viewer.photosHint')),
    h('ul', { class: 'plain' }, photos.map(photoItem)),
  );
}

/** Целият панел за текущата страница. `state` = { meta, page, pageCount, answer, marks, hasPdf }. */
export function buildPanel(state, actions) {
  const { meta, page, pageCount, answer, marks } = state;
  return [
    trail(meta, page, pageCount, actions.openRevision),
    answer ? used(meta, page, answer, actions.gotoPage) : null,
    marksSection(marks),
    photosSection(answer),
  ];
}
