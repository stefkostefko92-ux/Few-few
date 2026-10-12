// Резултатите от търсенето на документи и от бързия преглед на код (FR-03, §12.1) — само
// h()/textContent. Значките носят текст и форма (не само цвят); всеки резултат има бутон
// „Отвори страница N“ към визуализатора (§9.2).

import { h } from './dom.js';
import { has, t } from './i18n.js';

const typeLabel = (type) =>
  has(`admin.docType.${type}`) ? t(`admin.docType.${type}`) : String(type ?? '');
const optionsText = (o) =>
  Object.entries(o ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

function tag(kind, text) {
  return h('span', { class: `ds-tag ds-tag-${kind}` }, text);
}

function applicabilityTag(applicable) {
  if (applicable === true) return tag('ok', t('docsearch.applicable'));
  if (applicable === false) return tag('warn', t('docsearch.notApplicable'));
  return null;
}

/** Един документ: код/ревизия, заглавие, тип, страница, значки, откъс, „Отвори“. */
export function docHit(hit, onOpen) {
  const page = Number(hit.page) || 1;
  const title = `${hit.code} · ${t('docsearch.rev', { rev: hit.revision })}`;
  return h(
    'li',
    { class: 'ds-hit' },
    h(
      'h3',
      { class: 'ds-hit-title' },
      h('span', { class: 'mono' }, title),
      ' ',
      String(hit.title ?? ''),
    ),
    h(
      'p',
      { class: 'ds-meta' },
      typeLabel(hit.type),
      ' · ',
      String(hit.language ?? '').toUpperCase(),
      ' · ',
      t('docsearch.page', { page }),
      hit.models?.length ? ` · ${hit.models.join(', ')}` : '',
    ),
    h(
      'p',
      { class: 'ds-tags' },
      applicabilityTag(hit.applicable),
      hit.boardSpecific ? tag('info', t('docsearch.boardOnly')) : null,
      hit.safetyRelevant ? tag('warn', t('docsearch.safety')) : null,
      ...(hit.options ?? []).map((o) => tag('info', t('options.list', { list: optionsText(o) }))),
    ),
    hit.snippet ? h('p', { class: 'ds-snippet' }, String(hit.snippet)) : null,
    h(
      'button',
      {
        class: 'btn btn-secondary',
        type: 'button',
        'aria-label': `${t('docsearch.openPage', { page })}: ${hit.code}`,
        onclick: () =>
          onOpen({
            documentId: hit.documentId,
            page,
            documentCode: hit.code,
            documentTitle: hit.title,
          }),
      },
      t('docsearch.openPage', { page }),
    ),
  );
}

const VALIDITY = { expired: 'docsearch.sourceExpired', notYetEffective: 'docsearch.sourceFuture' };

/** Един запис от базата с кодове: значение, приложимост, проверки и връзка към източника. */
export function codeHit(e, onOpen) {
  const relations = Array.isArray(e.relations) ? e.relations : [];
  const validity = VALIDITY[e.sourceValidity];
  return h(
    'article',
    { class: 'ds-hit ds-code' },
    h(
      'h3',
      { class: 'ds-hit-title' },
      h('span', { class: 'mono' }, String(e.code ?? '')),
      ' — ',
      String(e.title ?? ''),
    ),
    h(
      'p',
      { class: 'ds-tags' },
      applicabilityTag(e.applicable),
      e.safetyRelevant ? tag('warn', t('docsearch.safety')) : null,
      validity ? tag('stop', t(validity)) : null,
      tag('info', `FW ${e.validity?.fwMin ?? '*'} – ${e.validity?.fwMax ?? '*'}`),
    ),
    h('p', null, String(e.description ?? '')),
    relations.length
      ? h(
          'ol',
          { class: 'ds-relations' },
          relations.map((r) =>
            h(
              'li',
              null,
              h('strong', null, `${t(`docsearch.rel.${r.kind}`)}: `),
              String(r.text ?? ''),
              r.expected ? h('span', { class: 'muted' }, ` → ${String(r.expected)}`) : null,
            ),
          ),
        )
      : null,
    e.source
      ? h(
          'button',
          {
            class: 'btn btn-secondary',
            type: 'button',
            onclick: () =>
              onOpen({
                documentId: e.source.documentId,
                page: e.source.page ?? 1,
                documentCode: e.source.documentCode,
              }),
          },
          t('docsearch.openSource', { code: String(e.source.documentCode ?? '') }),
        )
      : null,
  );
}
