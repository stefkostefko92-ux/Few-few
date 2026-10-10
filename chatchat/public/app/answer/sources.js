// Източниците (цитатите) с отваряне на страницата на документа.

import { h } from '../dom.js';
import { t } from '../i18n.js';
import { arr, block, str } from './util.js';

export function appendSources(root, { p, evidence, onOpenSource }) {
  if (!evidence.length) return;
  {
    root.append(
      block(
        t('ans.sources'),
        'blk-sources',
        h(
          'ul',
          { class: 'sources' },
          evidence.map((e) => {
            const canOpen = e.documentId && e.page != null;
            return h(
              'li',
              { class: 'source' },
              h('span', { class: 'ref-badge ref-badge-static' }, str(e.ref)),
              h(
                'div',
                { class: 'source-main' },
                h(
                  'p',
                  { class: 'source-id' },
                  h('strong', { class: 'mono' }, str(e.documentCode)),
                  e.revision ? ` · ${t('ans.rev')} ${str(e.revision)}` : '',
                  e.page != null ? ` · ${t('ans.page')} ${str(e.page)}` : '',
                  e.kind
                    ? ` · ${t(`ans.kind.${e.kind}`) === `ans.kind.${e.kind}` ? str(e.kind) : t(`ans.kind.${e.kind}`)}`
                    : '',
                ),
                e.documentTitle ? h('p', { class: 'source-title' }, str(e.documentTitle)) : null,
                e.section ? h('p', { class: 'source-section' }, str(e.section)) : null,
                e.quote ? h('blockquote', { class: 'quote' }, str(e.quote)) : null,
                canOpen
                  ? h(
                      'button',
                      {
                        class: 'btn btn-secondary btn-sm',
                        type: 'button',
                        onclick: () => onOpenSource(e, p),
                      },
                      t('ans.openPage'),
                      ` ${t('ans.page')} ${e.page}`,
                    )
                  : h('p', { class: 'muted small' }, t('ans.noPage')),
              ),
            );
          }),
        ),
      ),
    );
  }
}
